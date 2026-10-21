// backend/src/config/drive-googleapis.ts
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CREDENTIALS_PATH = path.resolve(process.cwd(), 'oauth_client.json');
const TOKEN_PATH = path.resolve(process.cwd(), 'token.json');

let credentials;
try {
    const credentialsData = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    credentials = JSON.parse(credentialsData);
    console.log('✅ Credenciales cargadas correctamente');
} catch (error) {
    console.error('❌ Error al cargar oauth_client.json:', error);
    console.log(`📋 Ruta esperada: ${CREDENTIALS_PATH}`);
    process.exit(1);
}

// 🔥 DETECTAR SI ES APP WEB O ESCRITORIO
const creds = credentials.installed || credentials.web;

const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    'http://localhost:3000'
);

if (fs.existsSync(TOKEN_PATH)) {
    try {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(token);
        console.log('✅ Token cargado correctamente');
    } catch (error) {
        console.error('❌ Error al cargar token.json:', error);
    }
} else {
    console.warn('⚠️ No se encontró token.json');
    console.log(`📋 Ruta esperada: ${TOKEN_PATH}`);
}

const drive = google.drive({ version: 'v3', auth: oAuth2Client });

export const DRIVE_FOLDER = process.env['DRIVE_FOLDER'] || 'gigantografias';

console.log('🔵 Google Drive configurado con googleapis:');
console.log(`📁 Carpeta en Drive: ${DRIVE_FOLDER}`);

export { oAuth2Client, drive };