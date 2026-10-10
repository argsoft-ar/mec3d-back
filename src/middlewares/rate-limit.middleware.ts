import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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
  standardHeaders: true,
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
  message: { error: "Demasiadas consultas del código de entrega, intente más tarde" },
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
