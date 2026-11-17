import { Server, Socket } from "socket.io";
import { z } from "zod";
import { Server as HttpServer } from "http";
import { verifySocketToken } from "../utils/jwt.util";
import { chatRepository } from "../repositories/chat.repository";
import { mapMensaje, chatService } from "../services/chat.service";
import { setIO } from "./io.instance";
import { notificarMensaje, salaUsuario } from "./notificaciones";
import { TokenPayload } from "../interfaces/auth.interface";
import { envConfig } from "../config/env.config";
import { parseAllowedOrigins } from "../utils/cors-origins.util";
import { AppError } from "../errors/app-error";

// Ventana deslizante en memoria para limitar mensajes por usuario: express-rate-limit
// no aplica a WebSockets, así que se replica la misma idea de forma equivalente a chatLimiter.
const MENSAJES_WINDOW_MS = 60_000;
const MENSAJES_MAX = 30;
const mensajesPorUsuario = new Map<string, number[]>();
const LECTURAS_MAX = 60;
const lecturasPorUsuario = new Map<string, number[]>();

// Las rooms de conversación y las personales (user:<id>) comparten espacio de nombres: solo UUIDs.
const conversacionIdSchema = z.string().uuid();

const MSG_CONVERSACION_CERRADA =
  "La otra parte cerró esta conversación: ya no admite mensajes";

function excedeVentana(
  mapa: Map<string, number[]>,
  userId: string,
  max: number,
): boolean {
  const ahora = Date.now();
  const timestamps = (mapa.get(userId) ?? []).filter(
    (t) => ahora - t < MENSAJES_WINDOW_MS,
  );
  timestamps.push(ahora);
  mapa.set(userId, timestamps);
  return timestamps.length > max;
}

export function excedeLimite(userId: string): boolean {
  return excedeVentana(mensajesPorUsuario, userId, MENSAJES_MAX);
}

// Sin esto el mapa crece con cada usuario que alguna vez escribió: se descartan las entradas
// cuya última marca ya salió de la ventana.
export function purgarMensajesViejos(ahora: number = Date.now()): number {
  let purgadas = 0;
  for (const mapa of [mensajesPorUsuario, lecturasPorUsuario]) {
    for (const [userId, timestamps] of mapa) {
      if (timestamps.every((t) => ahora - t >= MENSAJES_WINDOW_MS)) {
        mapa.delete(userId);
        purgadas++;
      }
    }
  }
  return purgadas;
}

export function cantidadUsuariosEnLimite(): number {
  return mensajesPorUsuario.size;
}

interface JoinAck {
  ok: boolean;
  error?: string;
}

interface EnviarMensajeAck {
  ok: boolean;
  error?: string;
  code?: string;
  mensaje?: unknown;
}

interface MarcarLeidoAck {
  ok: boolean;
  error?: string;
  conversacionId?: string;
  noLeidos?: 0;
}

let purgaTimer: NodeJS.Timeout | null = null;

// Autenticación en el handshake: el cliente obtiene un token efímero con
// POST /api/v1/auth/socket-token (la cookie de sesión no viaja: el socket conecta directo a
// la API, en otro dominio) y lo envía en `auth.token`. Solo se aceptan tokens con aud "socket";
// un JWT de sesión se rechaza.
export function autenticarHandshake(
  socket: Pick<Socket, "handshake" | "data">,
  next: (err?: Error) => void,
): void {
  const raw: unknown = socket.handshake.auth?.token;
  if (typeof raw !== "string" || raw.length === 0) {
    next(new Error("No autorizado"));
    return;
  }

  const payload = verifySocketToken(raw);
  if (!payload) {
    next(new Error("Token inválido o expirado"));
    return;
  }

  socket.data.user = payload;
  next();
}

function purgarPeriodicamente(): void {
  if (purgaTimer) return;
  purgaTimer = setInterval(() => purgarMensajesViejos(), MENSAJES_WINDOW_MS);
  purgaTimer.unref();
}

export function initChatSocket(httpServer: HttpServer): Server {
  const allowedOrigins = parseAllowedOrigins(envConfig.cors.origin);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      credentials: true,
    },
  });

  io.use(autenticarHandshake);

  io.on("connection", (socket: Socket) => {
    // Room personal derivada del JWT; socket.io la abandona sola al desconectar.
    const connUserId = (socket.data.user as TokenPayload | undefined)?.id;
    if (connUserId) {
      socket.join(salaUsuario(connUserId));
    }

    socket.on(
      "join-conversacion",
      async (conversacionId: string, callback?: (res: JoinAck) => void) => {
        const userId = (socket.data.user as TokenPayload | undefined)?.id;
        if (
          !userId ||
          !conversacionIdSchema.safeParse(conversacionId).success
        ) {
          callback?.({ ok: false, error: "Solicitud inválida" });
          return;
        }

        // Autorización: solo comprador_id/fabricante_id de la conversación pueden
        // unirse a su room (y no si la cerraron); nunca se confía en el cliente.
        const puedeUnirse = await chatService
          .puedeUnirse(conversacionId, userId)
          .catch(() => false);
        if (!puedeUnirse) {
          callback?.({
            ok: false,
            error: "No autorizado para esta conversación",
          });
          return;
        }

        socket.join(conversacionId);
        // Re-chequeo post-join: si el usuario cerró la conversación entre el chequeo y el join,
        // sacarUsuarioDeSala pudo correr antes del join y dejarlo dentro de la room.
        const sigueAutorizado = await chatService
          .puedeUnirse(conversacionId, userId)
          .catch(() => false);
        if (!sigueAutorizado) {
          socket.leave(conversacionId);
          callback?.({
            ok: false,
            error: "No autorizado para esta conversación",
          });
          return;
        }
        callback?.({ ok: true });
      },
    );

    socket.on(
      "enviar-mensaje",
      async (
        data: { conversacionId: string; contenido: string },
        callback?: (res: EnviarMensajeAck) => void,
      ) => {
        const userId = (socket.data.user as TokenPayload | undefined)?.id;
        if (
          !userId ||
          !conversacionIdSchema.safeParse(data?.conversacionId).success ||
          typeof data?.contenido !== "string"
        ) {
          callback?.({ ok: false, error: "Solicitud inválida" });
          return;
        }

        if (excedeLimite(userId)) {
          callback?.({
            ok: false,
            error: "Demasiados mensajes, espere un momento",
          });
          return;
        }

        const contenido = data.contenido.trim();
        if (contenido.length === 0 || contenido.length > 2000) {
          callback?.({ ok: false, error: "Mensaje inválido" });
          return;
        }

        // Participante, ninguna de las partes cerró el chat y la orden no fue cancelada/rechazada.
        try {
          await chatService.assertPuedeEnviar(data.conversacionId, userId);
        } catch (error) {
          // AppError fija su prototipo a AppError.prototype, así que `instanceof ConflictError`
          // nunca es true: se identifica el conflicto por statusCode 409.
          if (error instanceof AppError && error.statusCode === 409) {
            // El front usa `code` (p. ej. CONVERSACION_CERRADA) para distinguir el caso.
            callback?.({
              ok: false,
              error: error.message,
              ...(error.code ? { code: error.code } : {}),
            });
          } else {
            callback?.({
              ok: false,
              error: "No autorizado para esta conversación",
            });
          }
          return;
        }

        // Se persiste antes de emitir: el mensaje nunca vive solo en memoria/socket.
        // Inserción guardada (CWE-367): re-valida el cierre/estado en la misma sentencia y se
        // serializa con el cierre; assertPuedeEnviar queda como pre-chequeo rápido (403/404).
        let mensaje;
        try {
          mensaje = await chatRepository.crearMensajeSiAbierta({
            conversacionId: data.conversacionId,
            remitenteId: userId,
            contenido,
            tipo: "texto",
          });
        } catch {
          callback?.({ ok: false, error: "No se pudo enviar el mensaje" });
          return;
        }
        if (!mensaje) {
          callback?.({
            ok: false,
            error: MSG_CONVERSACION_CERRADA,
            code: "CONVERSACION_CERRADA",
          });
          return;
        }

        // El repositorio devuelve la fila cruda (snake_case); si se emite tal cual,
        // "mensaje.conversacionId" queda undefined en el front y el evento se
        // descarta en silencio (el mensaje nunca aparece en tiempo real).
        const mensajeMapeado = mapMensaje(mensaje);
        io.to(data.conversacionId).emit("nuevo-mensaje", mensajeMapeado);
        notificarMensaje(mensaje);
        callback?.({ ok: true, mensaje: mensajeMapeado });
      },
    );

    socket.on(
      "marcar-leido",
      async (
        data: { conversacionId: string },
        callback?: (res: MarcarLeidoAck) => void,
      ) => {
        const userId = (socket.data.user as TokenPayload | undefined)?.id;
        if (
          !userId ||
          !conversacionIdSchema.safeParse(data?.conversacionId).success
        ) {
          callback?.({ ok: false, error: "Solicitud inválida" });
          return;
        }
        if (excedeVentana(lecturasPorUsuario, userId, LECTURAS_MAX)) {
          callback?.({ ok: false, error: "Demasiadas solicitudes" });
          return;
        }
        try {
          const res = await chatService.marcarLeida(
            data.conversacionId,
            userId,
          );
          callback?.({ ok: true, ...res });
        } catch {
          callback?.({
            ok: false,
            error: "No autorizado para esta conversación",
          });
        }
      },
    );
  });

  setIO(io);
  purgarPeriodicamente();
  return io;
}
