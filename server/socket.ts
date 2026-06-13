import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

export let io: Server | null = null;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-tenant', (companyName: string) => {
      if (companyName) {
        const roomName = `tenant_${companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        socket.join(roomName);
        console.log(`[Socket] Socket ${socket.id} joined room: ${roomName}`);
      }
    });
  });

  return io;
}

export function notifyTenantRequestsUpdate(companyName: string) {
  if (io && companyName) {
    const roomName = `tenant_${companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    io.to(roomName).emit('requests-updated');
    console.log(`[Socket] Broadcast 'requests-updated' to room: ${roomName}`);
  }
}
