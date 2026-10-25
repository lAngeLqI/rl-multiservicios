// src/controllers/pedidoController.ts
import { Request, Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { io } from '../server.js';
import { uploadToDrive } from '../services/drive-googleapis-service.js';
import fs from 'fs';
import path from 'path';
import StreamZip from 'node-stream-zip';

export const createPedido = async (req: AuthRequest, res: Response) => {
    try {
        const { nombre, fecha_entrega, prioridad, comentario_general } = req.body;
        const disenador_id = req.userId;

        if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
            return res.status(400).json({ success: false, message: 'Debes subir al menos un archivo' });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            const pedidoResult = await client.query(
                `INSERT INTO pedidos (nombre, fecha_entrega, prioridad, comentario_general, disenador_id, estado, created_at) 
                 VALUES ($1, $2, $3, $4, $5, 'pendiente', NOW() AT TIME ZONE 'America/Lima') RETURNING id`,
                [nombre, fecha_entrega, prioridad || 'media', comentario_general, disenador_id]
            );

            const pedidoId = pedidoResult.rows[0].id;
            const files = req.files as Express.Multer.File[];
            const uploadsDir = path.resolve(process.env['UPLOAD_DIR'] || './uploads');

            const uploadPromises = files.map(async (file) => {
                try {
                    const ext = path.extname(file.originalname).toLowerCase();
                    
                    // 🔥 PROCESAR ZIP
                    if (ext === '.zip') {
                        console.log(`📦 Procesando ZIP: ${file.originalname}`);
                        
                        const tempDir = path.resolve(uploadsDir, `temp_zip_${Date.now()}`);
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                        const zip = new StreamZip.async({ file: file.path });
                        await zip.extract(null, tempDir);
                        await zip.close();

                        const archivosExtraidos: string[] = [];

                        // 🔥 FUNCIÓN PARA RECORRER CARPETAS DEL ZIP
                        const recorrerCarpeta = (dir: string) => {
                            const archivos = fs.readdirSync(dir);
                            
                            for (const archivo of archivos) {
                                const fullPath = path.join(dir, archivo);
                                const stat = fs.statSync(fullPath);

                                if (stat.isDirectory()) {
                                    recorrerCarpeta(fullPath);
                                } else {
                                    const fileNameInsideZip = path.basename(fullPath);
                                    if (fileNameInsideZip.startsWith('__MACOSX') || fileNameInsideZip.startsWith('.')) continue;
                                    archivosExtraidos.push(fullPath);
                                }
                            }
                        };

                        recorrerCarpeta(tempDir);
                        const resultadosArchivos = [];

                        // Procesamos cada archivo encontrado
                        for (const fullPath of archivosExtraidos) {
                            const fileNameInsideZip = path.basename(fullPath);
                            console.log(`📤 Subiendo desde ZIP a Drive: ${fileNameInsideZip}`);

                            const driveResult = await uploadToDrive(fullPath, fileNameInsideZip, 'application/octet-stream');
                            
                            const stats = fs.statSync(fullPath);
                            const tamañoMb = stats.size / 1024 / 1024;

                            const archivoResult = await client.query(
                                `INSERT INTO archivos 
                                 (nombre_original, nombre_guardado, ruta, tamaño_mb, tipo, pedido_id, estado, created_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, 'listo', NOW() AT TIME ZONE 'America/Lima') RETURNING id`,
                                [
                                    fileNameInsideZip, 
                                    `drive_${Date.now()}_${fileNameInsideZip}`, 
                                    driveResult.url, 
                                    tamañoMb, 
                                    'application/octet-stream', 
                                    pedidoId
                                ]
                            );

                            resultadosArchivos.push({ 
                                id: archivoResult.rows[0].id, 
                                nombre: fileNameInsideZip, 
                                tamaño: tamañoMb 
                            });
                        }

                        // Limpieza
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                        
                        console.log(`✅ ZIP procesado: ${resultadosArchivos.length} archivos guardados.`);
                        return resultadosArchivos;

                    } else {
                        // 🔥 PROCESAR ARCHIVO NORMAL
                        console.log(`📤 Subiendo archivo: ${file.originalname}`);
                        
                        const driveResult = await uploadToDrive(file.path, file.originalname, file.mimetype);
                        const tamañoMb = (file.size / 1024 / 1024);

                        const archivoResult = await client.query(
                            `INSERT INTO archivos 
                             (nombre_original, nombre_guardado, ruta, tamaño_mb, tipo, pedido_id, estado, created_at) 
                             VALUES ($1, $2, $3, $4, $5, $6, 'listo', NOW() AT TIME ZONE 'America/Lima') RETURNING id`,
                            [
                                file.originalname, 
                                `drive_${Date.now()}_${file.originalname}`, 
                                driveResult.url, 
                                tamañoMb, 
                                file.mimetype, 
                                pedidoId
                            ]
                        );

                        return [{ id: archivoResult.rows[0].id, nombre: file.originalname, tamaño: tamañoMb }];
                    }

                } catch (error) {
                    console.error(`❌ Error procesando archivo ${file.originalname}:`, error);
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                    return [];
                }
            });

            const resultados = await Promise.all(uploadPromises);
            const archivosGuardados = resultados.flat();

            await client.query('COMMIT');

            io.emit('nuevo-pedido', { pedidoId, disenador_id, mensaje: `📦 Nuevo pedido: ${nombre}` });

            return res.status(201).json({
                success: true,
                message: 'Pedido creado exitosamente',
                data: { pedidoId, archivos: archivosGuardados }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error en createPedido:', error);
        return res.status(500).json({ success: false, message: 'Error al crear el pedido' });
    }
};

// ========== OBTENER TODOS LOS PEDIDOS (Operador) ==========
export const getPedidos = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10, estado, prioridad } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = `
            SELECT p.*, 
                   d.nombre as disenador_nombre, 
                   o.nombre as operador_nombre,
                   (SELECT COUNT(*) FROM archivos WHERE pedido_id = p.id) as total_archivos
            FROM pedidos p
            LEFT JOIN usuarios d ON p.disenador_id = d.id
            LEFT JOIN usuarios o ON p.operador_id = o.id
            WHERE 1=1
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (estado) {
            query += ` AND p.estado = $${paramIndex++}`;
            params.push(estado);
        }

        if (prioridad) {
            query += ` AND p.prioridad = $${paramIndex++}`;
            params.push(prioridad);
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(Number(limit), offset);

        const result = await pool.query(query, params);

        let countQuery = 'SELECT COUNT(*) as total FROM pedidos WHERE 1=1';
        const countParams: any[] = [];
        let countIndex = 1;

        if (estado) { 
            countQuery += ` AND estado = $${countIndex++}`; 
            countParams.push(estado); 
        }
        if (prioridad) { 
            countQuery += ` AND prioridad = $${countIndex++}`; 
            countParams.push(prioridad); 
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        return res.json({
            success: true,
            data: {
                items: result.rows,
                total: total,
                page: Number(page),
                totalPages: Math.ceil(total / Number(limit))
            }
        });

    } catch (error) {
        console.error('Error en getPedidos:', error);
        return res.status(500).json({ success: false, message: 'Error al obtener pedidos' });
    }
};

// ========== OBTENER PEDIDOS POR DISEÑADOR ==========
export const getPedidosByDisenador = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId; 

        const result = await pool.query(
            `SELECT p.*, 
                    (SELECT COUNT(*) FROM archivos WHERE pedido_id = p.id) as total_archivos
             FROM pedidos p
             WHERE p.disenador_id = $1
             ORDER BY p.created_at DESC`,
            [userId] 
        );

        return res.json({ success: true, data: result.rows });

    } catch (error) {
        console.error('Error en getPedidosByDisenador:', error);
        return res.status(500).json({ success: false, message: 'Error al obtener pedidos' });
    }
};

// ========== OBTENER PEDIDO POR ID ==========
export const getPedidoById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT p.*, 
                    d.nombre as disenador_nombre, 
                    o.nombre as operador_nombre
             FROM pedidos p
             LEFT JOIN usuarios d ON p.disenador_id = d.id
             LEFT JOIN usuarios o ON p.operador_id = o.id
             WHERE p.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
        }

        const archivosResult = await pool.query(
            'SELECT * FROM archivos WHERE pedido_id = $1',
            [id]
        );

        return res.json({
            success: true,
            data: { 
                ...result.rows[0], 
                archivos: archivosResult.rows 
            }
        });

    } catch (error) {
        console.error('Error en getPedidoById:', error);
        return res.status(500).json({ success: false, message: 'Error al obtener el pedido' });
    }
};

// ========== CAMBIAR ESTADO DEL PEDIDO ==========
export const updateEstado = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const operadorId = req.userId;

        const result = await pool.query(
            'UPDATE pedidos SET estado = $1, operador_id = $2 WHERE id = $3',
            [estado, operadorId, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
        }

        io.emit('estado-cambiado', {
            pedidoId: id,
            nuevoEstado: estado,
            mensaje: `🔄 Pedido #${id} cambiado a "${estado}"`
        });

        return res.json({ success: true, message: 'Estado actualizado correctamente' });

    } catch (error) {
        console.error('Error en updateEstado:', error);
        return res.status(500).json({ success: false, message: 'Error al actualizar estado' });
    }
};

// ========== APROBAR PEDIDO (Operador) ==========
export const aprobarPedido = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE pedidos SET estado = 'aprobado' WHERE id = $1 AND estado = 'listo'`,
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(400).json({ success: false, message: 'El pedido no está listo para aprobar o no existe' });
        }

        io.emit('estado-cambiado', {
            pedidoId: id,
            nuevoEstado: 'aprobado',
            mensaje: `✅ Pedido #${id} aprobado`
        });

        return res.json({ success: true, message: 'Pedido aprobado correctamente' });

    } catch (error) {
        console.error('Error en aprobarPedido:', error);
        return res.status(500).json({ success: false, message: 'Error al aprobar pedido' });
    }
};

// ========== OBTENER ESTADÍSTICAS ==========
export const getStats = async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
                COUNT(*) FILTER (WHERE estado = 'proceso') as en_proceso,
                COUNT(*) FILTER (WHERE estado = 'impreso') as impresos,
                COUNT(*) FILTER (WHERE estado = 'entregado') as entregados,
                COUNT(*) FILTER (WHERE prioridad = 'urgente') as urgentes
            FROM pedidos
        `);

        const stats = result.rows[0];

        return res.json({
            success: true,
            data: {
                total: parseInt(stats.total),
                pendientes: parseInt(stats.pendientes),
                en_proceso: parseInt(stats.en_proceso),
                impresos: parseInt(stats.impresos),
                entregados: parseInt(stats.entregados),
                urgentes: parseInt(stats.urgentes)
            }
        });

    } catch (error) {
        console.error('Error en getStats:', error);
        return res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
    }
};