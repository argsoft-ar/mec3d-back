// Sesión: cookie HttpOnly `mec3d_session` (SameSite=Lax, Path=/, Secure en producción,
// Max-Age = vencimiento del JWT). POST/PUT/PATCH/DELETE exigen Origin/Referer permitido (CSRF).
const sessionSetCookieHeader = {
  description:
    "mec3d_session=<jwt>; Max-Age=<segundos>; Path=/; HttpOnly; SameSite=Lax (+ Secure en producción)",
  schema: { type: "string" },
};

const apiError = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ApiError" },
    },
  },
});

const csrfError = apiError(
  "Origin/Referer ausente o fuera de la allowlist de CORS (protección CSRF)",
);

export const authPaths = {
  "/auth/registro": {
    post: {
      tags: ["Auth"],
      summary: "Registrar un nuevo usuario",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/RegisterRequest",
            },
          },
        },
      },
      responses: {
        201: {
          description:
            "Usuario registrado exitosamente. Abre la sesión: setea la cookie HttpOnly mec3d_session (el token no va en el body).",
          headers: { "Set-Cookie": sessionSetCookieHeader },
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RegisterResponse",
              },
            },
          },
        },
        400: {
          description: "Error de validación",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationError",
              },
            },
          },
        },
        403: csrfError,
        409: {
          description: "Email o nombre de usuario no disponible",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
              examples: {
                email: { value: { error: "El email ya está registrado" } },
                username: {
                  value: { error: "El nombre de usuario no está disponible" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/auth/username-disponible": {
    get: {
      tags: ["Auth"],
      summary: "Verificar disponibilidad de un nombre de usuario (público)",
      parameters: [
        {
          name: "username",
          in: "query",
          required: true,
          schema: {
            type: "string",
            minLength: 3,
            maxLength: 30,
            pattern: String.raw`^\w+$`,
          },
        },
      ],
      responses: {
        200: {
          description: "Resultado de la consulta",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { disponible: { type: "boolean", example: true } },
              },
            },
          },
        },
        400: {
          description: "Username inválido",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationError",
              },
            },
          },
        },
        429: {
          description: "Demasiadas consultas",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
      },
    },
  },
  "/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Iniciar sesión",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/LoginRequest",
            },
          },
        },
      },
      responses: {
        200: {
          description:
            "Login exitoso. Setea la cookie HttpOnly mec3d_session (el token no va en el body).",
          headers: { "Set-Cookie": sessionSetCookieHeader },
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginResponse",
              },
            },
          },
        },
        403: csrfError,
        401: {
          description: "Credenciales inválidas",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
      },
    },
  },
  "/auth/me": {
    get: {
      tags: ["Auth"],
      summary: "Usuario de la sesión actual (cookie mec3d_session)",
      security: [{ cookieAuth: [] }],
      responses: {
        200: {
          description: "Sesión válida",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MeResponse" },
            },
          },
        },
        401: apiError("Sin cookie de sesión, o sesión inválida/expirada"),
      },
    },
  },
  "/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Cerrar sesión (borra la cookie; idempotente)",
      responses: {
        204: {
          description: "Cookie borrada (también si no había sesión)",
          headers: {
            "Set-Cookie": {
              description:
                "mec3d_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
              schema: { type: "string" },
            },
          },
        },
        403: csrfError,
      },
    },
  },
  "/auth/socket-token": {
    post: {
      tags: ["Auth"],
      summary:
        'Token efímero (~60 s, aud "socket") para socket.handshake.auth.token',
      security: [{ cookieAuth: [] }],
      responses: {
        200: {
          description: "Token para el handshake de socket.io",
          headers: {
            "Cache-Control": {
              schema: { type: "string", example: "no-store" },
            },
          },
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SocketTokenResponse" },
            },
          },
        },
        401: apiError("Sin cookie de sesión, o sesión inválida/expirada"),
        403: csrfError,
      },
    },
  },
};
