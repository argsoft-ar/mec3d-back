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

// Avisa a todos los participantes salvo el remitente (los de sistema van a ambos).
export function notificarMensaje(
  mensaje: MensajeCreadoRow,
  excluir: string[] = [],
): void {
  const destinatarios = new Set(
    [mensaje.comprador_id, mensaje.fabricante_id].filter(
      (id): id is string =>
        typeof id === "string" &&
        id !== mensaje.remitente_id &&
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
