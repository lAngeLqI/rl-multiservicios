// backend/src/services/drive-googleapis-service.ts
import { drive, DRIVE_FOLDER } from '../config/drive-googleapis.js';
import fs from 'fs';

// 🔼 OBTENER O CREAR CARPETA EN DRIVE
export const getOrCreateFolder = async (folderName: string): Promise<string> => {
    try {
        const response = await drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        const folders = response.data.files || [];

        if (folders.length > 0) {
            return folders[0]?.id || '';
        }

        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
        };

        const newFolder = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id',
        });

        return newFolder.data.id || '';
    } catch (error) {
        console.error('❌ Error al crear carpeta:', error);
        throw error;
    }
};

// 🔼 SUBIR ARCHIVO A DRIVE
export const uploadToDrive = async (
    filePath: string,
    fileName: string,
    mimeType: string
) => {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Archivo no encontrado: ${filePath}`);
        }

        const folderId = await getOrCreateFolder(DRIVE_FOLDER);

        const fileMetadata = {
            name: fileName,
            parents: [folderId],
        };

        const media = {
            mimeType: mimeType || 'application/octet-stream',
            body: fs.createReadStream(filePath),
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink',
        });

        const fileId = response.data.id;
        const publicUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

        // Eliminar archivo temporal
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return { success: true, url: publicUrl, id: fileId };
    } catch (error) {
        console.error('❌ Error al subir a Drive:', error);
        throw error;
    }
};

// 🔽 DESCARGAR ARCHIVO DE DRIVE
export const downloadFromDrive = async (fileUrl: string): Promise<Buffer> => {
    try {
        const match = fileUrl.match(/id=([^&]+)/);
        if (!match) throw new Error('No se pudo extraer el ID del archivo');
        
        const fileId = match[1];
        // 🔥 AGREGA ESTA VALIDACIÓN
        if (!fileId) throw new Error('ID del archivo no válido');

        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' }, // Ahora TypeScript sabe que es un string
            { responseType: 'stream' }
        );

        const chunks: Buffer[] = [];
        const stream = response.data as NodeJS.ReadableStream;

        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', (error) => reject(error));
        });
    } catch (error) {
        console.error('❌ Error al descargar de Drive:', error);
        throw error;
    }
};

// 🗑️ ELIMINAR ARCHIVO DE DRIVE
export const deleteFromDrive = async (fileUrl: string) => {
    try {
        const match = fileUrl.match(/id=([^&]+)/);
        if (!match) throw new Error('No se pudo extraer el ID del archivo');
        
        const fileId = match[1];
        // 🔥 AGREGA ESTA VALIDACIÓN
        if (!fileId) throw new Error('ID del archivo no válido');

        await drive.files.delete({ fileId: fileId }); // Ahora TypeScript sabe que es un string
        return { success: true };
    } catch (error) {
        console.error('❌ Error al eliminar de Drive:', error);
        throw error;
    }
};