import { getIO } from "./io.instance";
import { aTextoPlano } from "../utils/texto.util";
import {
  MensajeCreadoRow,
  NotificacionMensaje,
} from "../interfaces/chat.interface";

const PREVIEW_MAX = 100;

// Room personal: el servidor la asigna al conectar, el cliente nunca la elige.
export const salaUsuario = (userId: string): string => `user:${userId}`;

// No-op si el socket no está inicializado (tests, scripts): una notificación nunca rompe el flujo.
export function notificarUsuario(
  userId: string,
  evento: string,
  payload: unknown,
): void {
  const io = getIO();
  if (!io || !userId) return;
  try {
    io.to(salaUsuario(userId)).emit(evento, payload);
  } catch (error) {
    console.error(
      `❌ No se pudo emitir "${evento}":`,
      error instanceof Error ? error.message : error,
    );
  }
}

// Saca todos los sockets del usuario de una room (ej. conversación que cerró). No-op sin socket.
export function sacarUsuarioDeSala(userId: string, sala: string): void {
  const io = getIO();
  if (!io || !userId) return;
  try {
    io.in(salaUsuario(userId)).socketsLeave(sala);
  } catch (error) {
    console.error(
      `❌ No se pudo sacar al usuario de la sala ${sala}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

// Avisa a todos los participantes salvo el remitente (los de sistema van a ambos) y salvo
// quien cerró la conversación (ya no la ve: no debe recibir avisos de ella).
export function notificarMensaje(
  mensaje: MensajeCreadoRow,
  excluir: string[] = [],
): void {
  const cerraron = new Set<string>();
  if (mensaje.comprador_id && mensaje.cerrada_por_comprador_en) {
    cerraron.add(mensaje.comprador_id);
  }
  if (mensaje.fabricante_id && mensaje.cerrada_por_fabricante_en) {
    cerraron.add(mensaje.fabricante_id);
  }
  const destinatarios = new Set(
    [mensaje.comprador_id, mensaje.fabricante_id].filter(
      (id): id is string =>
        typeof id === "string" &&
        id !== mensaje.remitente_id &&
        !cerraron.has(id) &&
        !excluir.includes(id),
    ),
  );
  if (destinatarios.size === 0) return;

  const payload: NotificacionMensaje = {
    conversacionId: mensaje.conversacion_id,
    mensajeId: mensaje.id,
    remitenteUsername: mensaje.remitente_username ?? null,
    preview: aTextoPlano(mensaje.contenido, PREVIEW_MAX),
    tipo: mensaje.tipo,
    creadoEn: mensaje.creado_en,
  };
  for (const id of destinatarios) {
    notificarUsuario(id, "notificacion-mensaje", payload);
  }
}
