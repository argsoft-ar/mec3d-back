import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "../utils/jwt.util";
import { chatRepository } from "../repositories/chat.repository";
import { setIO } from "./io.instance";
import { TokenPayload } from "../interfaces/auth.interface";

// Ventana deslizante en memoria para limitar mensajes por usuario: express-rate-limit
// no aplica a WebSockets, así que se replica la misma idea de forma equivalente a chatLimiter.
const MENSAJES_WINDOW_MS = 60_000;
const MENSAJES_MAX = 30;
const mensajesPorUsuario = new Map<string, number[]>();

function excedeLimite(userId: string): boolean {
  const ahora = Date.now();
  const timestamps = (mensajesPorUsuario.get(userId) ?? []).filter(
    (t) => ahora - t < MENSAJES_WINDOW_MS,
  );
  timestamps.push(ahora);
  mensajesPorUsuario.set(userId, timestamps);
  return timestamps.length > MENSAJES_MAX;
}

interface JoinAck {
  ok: boolean;
  error?: string;
}

interface EnviarMensajeAck {
  ok: boolean;
  error?: string;
  mensaje?: unknown;
}

export function initChatSocket(httpServer: HttpServer): Server {
  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""));

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      credentials: true,
    },
  });

  // Autenticación en el handshake: se rechaza toda conexión sin un JWT válido,
  // equivalente a authenticateToken pero adaptado al protocolo de sockets.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("No autorizado"));
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      next(new Error("Token inválido o expirado"));
      return;
    }

    socket.data.user = payload as TokenPayload;
    next();
  });

  io.on("connection", (socket: Socket) => {
    socket.on(
      "join-conversacion",
      async (conversacionId: string, callback?: (res: JoinAck) => void) => {
        const userId = (socket.data.user as TokenPayload | undefined)?.id;
        if (typeof conversacionId !== "string" || !userId) {
          callback?.({ ok: false, error: "Solicitud inválida" });
          return;
        }

        // Autorización: solo comprador_id/fabricante_id de la conversación pueden
        // unirse a su room; nunca se confía en la membresía enviada por el cliente.
        const esParticipante = await chatRepository.esParticipante(
          conversacionId,
          userId,
        );
        if (!esParticipante) {
          callback?.({
            ok: false,
            error: "No autorizado para esta conversación",
          });
          return;
        }

        socket.join(conversacionId);
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
          typeof data?.conversacionId !== "string" ||
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

        const esParticipante = await chatRepository.esParticipante(
          data.conversacionId,
          userId,
        );
        if (!esParticipante) {
          callback?.({
            ok: false,
            error: "No autorizado para esta conversación",
          });
          return;
        }

        // Se persiste antes de emitir: el mensaje nunca vive solo en memoria/socket.
        const mensaje = await chatRepository.crearMensaje({
          conversacionId: data.conversacionId,
          remitenteId: userId,
          contenido,
          tipo: "texto",
        });

        io.to(data.conversacionId).emit("nuevo-mensaje", mensaje);
        callback?.({ ok: true, mensaje });
      },
    );
  });

  setIO(io);
  return io;
}
