// src/controllers/archivoController.ts
import { Request, Response } from 'express';
import pool from '../config/database.js';
import { downloadFromDrive, deleteFromDrive } from '../services/drive-googleapis-service.js';
import sharp from 'sharp';

// ========== OBTENER ARCHIVOS DE UN PEDIDO ==========
export const getArchivosByPedido = async (req: Request, res: Response) => {
    try {
        const { pedidoId } = req.params;

        const result = await pool.query(
            'SELECT * FROM archivos WHERE pedido_id = $1 ORDER BY created_at DESC',
            [pedidoId]
        );

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error en getArchivosByPedido:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener archivos'
        });
    }
};

// ========== DESCARGAR ARCHIVO ==========
export const downloadArchivo = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT * FROM archivos WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Archivo no encontrado en la BD'
            });
        }

        const archivo = result.rows[0];

        // 🔥 DESCARGAR DE GOOGLE DRIVE
        const fileData = await downloadFromDrive(archivo.ruta);

        res.setHeader('Content-Type', archivo.tipo || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre_original}"`);
        return res.send(fileData);

    } catch (error) {
        console.error('Error en downloadArchivo:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al descargar archivo'
        });
    }
};

// ========== PREVISUALIZAR ARCHIVO (TIFF A PNG) ==========
export const previewArchivo = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { size = 'medium' } = req.query;

        // 1. Buscar en la BD
        const result = await pool.query(
            'SELECT * FROM archivos WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Archivo no encontrado en la BD'
            });
        }

        const archivo = result.rows[0];

        // 2. 🔥 DESCARGAR DE GOOGLE DRIVE (en lugar de buscar en disco local)
        let fileData;
        try {
            fileData = await downloadFromDrive(archivo.ruta);
        } catch (driveError) {
            console.error('❌ Error al descargar de Drive:', driveError);
            return res.status(404).json({
                success: false,
                message: 'No se pudo descargar el archivo de Google Drive'
            });
        }

        // 3. Verificar si es imagen
        const isImage = archivo.tipo?.startsWith('image/') || 
                        archivo.nombre_original.match(/\.(tiff|tif|jpg|jpeg|png|gif|bmp|webp)$/i);

        if (!isImage) {
            return res.status(415).json({
                success: false,
                message: 'No se puede previsualizar este tipo de archivo'
            });
        }

        // 4. Configurar tamaño
        let width = 800;
        let height = 800;
        if (size === 'small') { width = 300; height = 300; } 
        else if (size === 'large') { width = 1200; height = 1200; }

        // 5. Convertir a PNG
        const pngBuffer = await sharp(fileData)
            .resize(width, height, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 80, compressionLevel: 6 })
            .toBuffer();

        // 6. Enviar
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Disposition', 'inline');
        return res.send(pngBuffer);

    } catch (error) {
        console.error('Error en previewArchivo:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al previsualizar archivo'
        });
    }
};

// ========== ELIMINAR ARCHIVO ==========
export const deleteArchivo = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT * FROM archivos WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Archivo no encontrado en la BD'
            });
        }

        const archivo = result.rows[0];

        // 🔥 ELIMINAR DE GOOGLE DRIVE
        await deleteFromDrive(archivo.ruta);

        // 🔥 ELIMINAR DE LA BD
        await pool.query('DELETE FROM archivos WHERE id = $1', [id]);

        return res.json({
            success: true,
            message: 'Archivo eliminado correctamente'
        });

    } catch (error) {
        console.error('Error en deleteArchivo:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al eliminar archivo'
        });
    }
};