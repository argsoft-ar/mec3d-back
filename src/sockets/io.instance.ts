import { Server } from "socket.io";

// Singleton simple para que servicios fuera de la capa de sockets (ej. orden-fabricacion.service)
// puedan emitir eventos sin crear un ciclo de imports con server.ts/sockets/chat.socket.ts.
let ioInstance: Server | null = null;

export function setIO(io: Server): void {
  ioInstance = io;
}

export function getIO(): Server | null {
  return ioInstance;
}
