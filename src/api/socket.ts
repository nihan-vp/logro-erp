import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
const callbacks = new Set<() => void>();

export function initSocket(companyName: string) {
  if (!companyName) return;
  if (socket) {
    socket.disconnect();
  }

  // Connect to the host origin
  socket = io(window.location.origin, {
    transports: ['websocket'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected to server');
    socket?.emit('join-tenant', companyName);
  });

  socket.on('requests-updated', () => {
    console.log("[Socket] Received 'requests-updated' event");
    callbacks.forEach(cb => cb());
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected from server');
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('[Socket] Socket closed');
  }
}

export function onRequestsUpdate(callback: () => void) {
  callbacks.add(callback);
}

export function offRequestsUpdate(callback: () => void) {
  callbacks.delete(callback);
}
