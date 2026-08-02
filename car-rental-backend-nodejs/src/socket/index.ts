import { Server } from 'socket.io';
import http from 'http';

let io: Server;

export const initSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: {
      origin: function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        if (!origin) return callback(null, true);
        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'https://nct-rental.onrender.com',
          'https://nct-rental.vercel.app',
          'https://www.nctrental.com',
          'https://nctrental.com'
        ];
        const isAllowed = allowedOrigins.some(allowed => 
          origin === allowed || 
          origin === `${allowed}/` ||
          origin.startsWith(allowed) ||
          (allowed.includes('onrender.com') && origin.endsWith('onrender.com'))
        );
        callback(null, true); // Allow all for now but log matching
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'X-Requested-With', 'Accept', 'Origin'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};
