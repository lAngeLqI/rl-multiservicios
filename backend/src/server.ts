import 'dotenv/config';                   
import app from './app.js';
import { Server as SocketServer } from 'socket.io';
import http from 'http';
import './config/drive-googleapis.js';

const PORT = process.env['PORT'] || 5005;

const allowedOrigins = [
  'http://localhost:5173',      // Vite dev
  'http://localhost:3000',      // Dev alternativo
  'tauri://localhost',          // Tauri en macOS / Linux
  'http://tauri.localhost',     // Tauri en Windows
  ...(process.env['CORS_ORIGINS']?.split(',').map(o => o.trim()) ?? []),
];

const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

export { io };

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🔗 API Health: /api/health`);
});