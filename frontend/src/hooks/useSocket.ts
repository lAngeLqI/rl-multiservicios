// src/hooks/useSocket.ts
import { io, Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005';

// 🔥 1. Creamos el socket FUERA del componente.
// Al estar fuera, React nunca lo destruirá por re-renders.
export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false, // No conectar hasta que el usuario esté logueado
  auth: {
    token: localStorage.getItem('token') || '',
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 60000,
});

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => {
      console.log('✅ Socket.IO conectado:', socket.id);
      setIsConnected(true);
    };
    const onDisconnect = () => {
      console.log('❌ Socket.IO desconectado');
      setIsConnected(false);
    };
    const onConnectError = (err: any) => {
      console.warn('⚠️ Socket Error:', err.message);
      setIsConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  return {
    socket,
    isConnected,
    on: socket.on.bind(socket),
    off: socket.off.bind(socket),
    emit: socket.emit.bind(socket),
  };
};