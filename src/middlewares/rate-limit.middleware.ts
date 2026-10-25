import type { Request, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { TooManyRequestsError } from "../errors/app-error";
import {
  getUploadMaxConcurrentGlobal,
  getUploadMaxConcurrentPerUser,
} from "../utils/policy.util";

// Limiters de rutas autenticadas: cuentan por usuario (no por IP, que en redes compartidas
// penaliza a terceros y permite rotar IPs); sin sesión caen a la IP.
const userKeyGenerator = (req: Request): string =>
  req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? "");

// Límite global generoso: una SPA con chat en tiempo real dispara muchas
// lecturas por navegación normal (listados, perfil, conversaciones, etc.);
// 500/15min se agotaba con uso normal y devolvía 429 de forma constante.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 2000,
  message: { error: "Demasiadas solicitudes, intente más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: { error: "Demasiados intentos de login, intente más tarde" },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

export const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  message: { error: "Demasiados intentos de registro, intente más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Chequeo de disponibilidad público (se dispara al tipear, con debounce): más holgado que authLimiter.
export const usernameCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  message: { error: "Demasiadas consultas, intente más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Endpoint público del preview 3D: cada visita firma una URL de R2; se limita por IP.
export const previewPublicoLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,
  message: {
    error: "Demasiadas solicitudes de vista previa, intente más tarde",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Crear/editar un diseño escribe en DB y puede encolar la generación del preview 3D (CPU/R2): por usuario.
export const productoEscrituraLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 60,
  message: { error: "Demasiados cambios en diseños, intente más tarde" },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: { error: "Demasiadas subidas de archivos, intente más tarde" },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

// Tope de subidas simultáneas (cada una bufferiza hasta 10 MB en memoria), por usuario y
// global. Va antes de multer para rechazar sin leer el cuerpo; el cupo se libera al terminar
// la respuesta (finish) o cortarse la conexión (close/error). Contadores en memoria de la instancia.
export function createUploadConcurrencyLimiter(
  getLimits: () => { porUsuario: number; global: number } = () => ({
    porUsuario: getUploadMaxConcurrentPerUser(),
    global: getUploadMaxConcurrentGlobal(),
  }),
): RequestHandler {
  let total = 0;
  const porClave = new Map<string, number>();

  return (req, res, next) => {
    const limites = getLimits();
    const clave = userKeyGenerator(req);
    const delUsuario = porClave.get(clave) ?? 0;
    if (total >= limites.global || delUsuario >= limites.porUsuario) {
      next(
        new TooManyRequestsError(
          "Hay demasiadas subidas en curso, intente nuevamente en unos segundos",
        ),
      );
      return;
    }

    total++;
    porClave.set(clave, delUsuario + 1);
    let liberada = false;
    const liberar = () => {
      if (liberada) return;
      liberada = true;
      total--;
      const restantes = (porClave.get(clave) ?? 1) - 1;
      if (restantes > 0) porClave.set(clave, restantes);
      else porClave.delete(clave);
    };
    res.once("finish", liberar);
    res.once("close", liberar);
    res.once("error", liberar);
    next();
  };
}

export const uploadConcurrencyLimiter = createUploadConcurrencyLimiter();

export const cerrarTratoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: {
    error: "Demasiados intentos de cierre de trato, intente más tarde",
  },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

// Confirmar entrega implica adivinar/probar un token de escrow: se limita igual
// que un intento de login para dificultar el fuerza bruta del hash.
export const confirmarEntregaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: {
    error: "Demasiados intentos de confirmación de entrega, intente más tarde",
  },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

// Cada consulta del comprador genera un código nuevo (escritura en DB e invalida el anterior).
export const codigoEntregaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30,
  message: {
    error: "Demasiadas consultas del código de entrega, intente más tarde",
  },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

// Cada propuesta escribe en DB y dispara un mensaje de chat en tiempo real: se limita por usuario.
export const proponerPrecioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 60,
  message: { error: "Demasiadas propuestas de precio, intente más tarde" },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

// Abrir una disputa congela fondos y notifica al fabricante: se limita por usuario.
export const disputaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { error: "Demasiados intentos de disputa, intente más tarde" },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

// Cada intento de pago crea una preference en la API de Mercado Pago.
export const pagoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30,
  message: { error: "Demasiados intentos de pago, intente más tarde" },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});

// Endpoint público de Mercado Pago: límite propio (la ruta se monta antes del apiLimiter global)
// y holgado para no descartar notificaciones legítimas en ráfagas.
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 300,
  message: { error: "Demasiadas notificaciones, intente más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

// El listado de conversaciones se re-consulta seguido: al abrir el chat y
// después de cada evento de socket (precio propuesto, trato cerrado, entrega
// declarada/completada) para refrescar estados. 30/min se quedaba corto con
// una negociación activa y tiraba 429 en pleno uso normal del chat.
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 180,
  message: { error: "Demasiadas solicitudes de chat, intente más tarde" },
  standardHeaders: true,
  keyGenerator: userKeyGenerator,
  legacyHeaders: false,
});
