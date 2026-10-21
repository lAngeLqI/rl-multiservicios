// src/controllers/adminController.ts
import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';

// ========== OBTENER USUARIOS PENDIENTES ==========
export const getUsuariosPendientes = async (_req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT id, nombre, email, rol, telefono, empresa, created_at 
             FROM usuarios 
             WHERE estado = 'pendiente' 
             ORDER BY created_at ASC`
        );

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error en getUsuariosPendientes:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios pendientes'
        });
    }
};

// ========== APROBAR USUARIO ==========
export const aprobarUsuario = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT id, nombre, email, rol FROM usuarios WHERE id = $1 AND estado = 'pendiente'`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado o ya procesado'
            });
        }

        const usuario = result.rows[0];

        await pool.query(
            `UPDATE usuarios SET estado = 'aprobado' WHERE id = $1`,
            [id]
        );

        return res.json({
            success: true,
            message: `✅ Usuario ${usuario.nombre} aprobado correctamente`,
            data: {
                usuario_id: id,
                nombre: usuario.nombre,
                email: usuario.email
            }
        });

    } catch (error) {
        console.error('Error en aprobarUsuario:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al aprobar usuario'
        });
    }
};

// ========== RECHAZAR USUARIO ==========
export const rechazarUsuario = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT id, nombre, email FROM usuarios WHERE id = $1 AND estado = 'pendiente'`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado o ya procesado'
            });
        }

        const usuario = result.rows[0];

        await pool.query(
            `UPDATE usuarios SET estado = 'rechazado' WHERE id = $1`,
            [id]
        );

        return res.json({
            success: true,
            message: `❌ Usuario ${usuario.nombre} rechazado`,
            data: {
                usuario_id: id,
                nombre: usuario.nombre,
                email: usuario.email
            }
        });

    } catch (error) {
        console.error('Error en rechazarUsuario:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al rechazar usuario'
        });
    }
};

// ========== OBTENER TODOS LOS USUARIOS ==========
export const getUsuarios = async (_req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT id, nombre, email, rol, estado, telefono, empresa, created_at 
             FROM usuarios 
             ORDER BY created_at DESC`
        );

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error en getUsuarios:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios'
        });
    }
};

// ================================================================
// ========== GESTIÓN DE DISPOSITIVOS ==========
// ================================================================

export const getDispositivosPendientes = async (_req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT d.*, u.nombre as usuario_nombre, u.email as usuario_email 
             FROM dispositivos d
             JOIN usuarios u ON d.usuario_id = u.id
             WHERE d.autorizado = FALSE
             ORDER BY d.created_at DESC`
        );

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error en getDispositivosPendientes:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener dispositivos pendientes'
        });
    }
};

export const getDispositivos = async (_req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT d.*, u.nombre as usuario_nombre, u.email as usuario_email 
             FROM dispositivos d
             JOIN usuarios u ON d.usuario_id = u.id
             ORDER BY d.created_at DESC`
        );

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error en getDispositivos:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener dispositivos'
        });
    }
};

export const autorizarDispositivo = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT d.*, u.nombre as usuario_nombre, u.email as usuario_email 
             FROM dispositivos d
             JOIN usuarios u ON d.usuario_id = u.id
             WHERE d.id = $1 AND d.autorizado = FALSE`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo no encontrado o ya autorizado'
            });
        }

        const dispositivo = result.rows[0];

        await pool.query(
            `UPDATE dispositivos SET autorizado = TRUE WHERE id = $1`,
            [id]
        );

        return res.json({
            success: true,
            message: `✅ Dispositivo "${dispositivo.nombre_dispositivo}" autorizado para ${dispositivo.usuario_nombre}`,
            data: {
                dispositivo_id: id,
                usuario: dispositivo.usuario_nombre,
                dispositivo: dispositivo.nombre_dispositivo
            }
        });

    } catch (error) {
        console.error('Error en autorizarDispositivo:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al autorizar dispositivo'
        });
    }
};

export const rechazarDispositivo = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT d.*, u.nombre as usuario_nombre 
             FROM dispositivos d
             JOIN usuarios u ON d.usuario_id = u.id
             WHERE d.id = $1 AND d.autorizado = FALSE`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo no encontrado o ya procesado'
            });
        }

        const dispositivo = result.rows[0];

        await pool.query(
            `DELETE FROM dispositivos WHERE id = $1`,
            [id]
        );

        return res.json({
            success: true,
            message: `❌ Dispositivo "${dispositivo.nombre_dispositivo}" rechazado`,
            data: {
                dispositivo_id: id,
                usuario: dispositivo.usuario_nombre,
                dispositivo: dispositivo.nombre_dispositivo
            }
        });

    } catch (error) {
        console.error('Error en rechazarDispositivo:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al rechazar dispositivo'
        });
    }
};

// ================================================================
// ========== ESTADÍSTICAS PARA ADMIN ==========
// ================================================================

export const getAdminStats = async (_req: AuthRequest, res: Response) => {
    try {
        // 🔥 En Postgres podemos hacer todas las estadísticas en una sola consulta
        const result = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios) as total_usuarios,
                (SELECT COUNT(*) FROM usuarios WHERE estado = 'pendiente') as usuarios_pendientes,
                (SELECT COUNT(*) FROM dispositivos WHERE autorizado = FALSE) as dispositivos_pendientes,
                (SELECT json_agg(t) FROM (SELECT rol, COUNT(*) as total FROM usuarios GROUP BY rol) t) as usuarios_por_rol
        `);

        const stats = result.rows[0];

        return res.json({
            success: true,
            data: {
                totalUsuarios: parseInt(stats.total_usuarios),
                usuariosPendientes: parseInt(stats.usuarios_pendientes),
                dispositivosPendientes: parseInt(stats.dispositivos_pendientes),
                usuariosPorRol: stats.usuarios_por_rol
            }
        });

    } catch (error) {
        console.error('Error en getAdminStats:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas'
        });
    }
};