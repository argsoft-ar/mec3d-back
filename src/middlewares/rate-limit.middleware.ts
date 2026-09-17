import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500,
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
  legacyHeaders: false,
});

export const cerrarTratoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: {
    error: "Demasiados intentos de cierre de trato, intente más tarde",
  },
  standardHeaders: true,
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
  legacyHeaders: false,
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  message: { error: "Demasiadas solicitudes de chat, intente más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});
