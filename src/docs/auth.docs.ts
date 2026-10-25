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
          description: "Usuario registrado exitosamente",
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
            pattern: "^\\w+$",
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
          description: "Login exitoso",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginResponse",
              },
            },
          },
        },
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
};
