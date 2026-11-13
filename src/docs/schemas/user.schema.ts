export const userSchemaDoc = {
  RolUsuario: {
    type: "string",
    enum: ["comprador", "disenador", "fabricante", "admin"],
  },
  User: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      email: { type: "string", format: "email" },
      rolPrincipal: { $ref: "#/components/schemas/RolUsuario" },
      zonaId: { type: "integer", nullable: true },
      puntuacion: { type: "number" },
      cuentaMercadopago: { type: "string", nullable: true },
      tagline: { type: "string", nullable: true },
      creadoEn: { type: "string", format: "date-time" },
      actualizadoEn: { type: "string", format: "date-time" },
    },
  },
  UserResponse: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      email: { type: "string", format: "email" },
      rolPrincipal: { $ref: "#/components/schemas/RolUsuario" },
      zonaId: { type: "integer", nullable: true },
      cuentaMercadopago: { type: "string", nullable: true },
    },
  },
  RegisterRequest: {
    type: "object",
    required: ["email", "username", "password", "rolPrincipal"],
    properties: {
      email: {
        type: "string",
        format: "email",
        example: "usuario@ejemplo.com",
      },
      username: {
        type: "string",
        minLength: 3,
        maxLength: 30,
        pattern: String.raw`^\w+$`,
        example: "juan_perez",
      },
      password: { type: "string", minLength: 8, example: "Password123" },
      rolPrincipal: { $ref: "#/components/schemas/RolUsuario" },
      zonaId: { type: "integer", example: 1 },
    },
  },
  RegisterResponse: {
    type: "object",
    properties: {
      message: { type: "string", example: "Usuario registrado exitosamente" },
      user: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          username: { type: "string", example: "juan_perez" },
          rolPrincipal: { $ref: "#/components/schemas/RolUsuario" },
          zonaId: { type: "integer", nullable: true },
          creadoEn: { type: "string", format: "date-time" },
        },
      },
    },
  },
  LoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: {
        type: "string",
        format: "email",
        example: "usuario@ejemplo.com",
      },
      password: { type: "string", example: "Password123" },
    },
  },
  LoginResponse: {
    type: "object",
    description:
      "El JWT de sesión NO viaja en el body: se entrega en la cookie HttpOnly mec3d_session (header Set-Cookie).",
    properties: {
      message: { type: "string", example: "Login exitoso" },
      user: { $ref: "#/components/schemas/UserResponse" },
    },
  },
  MeResponse: {
    type: "object",
    properties: {
      user: { $ref: "#/components/schemas/UserResponse" },
    },
  },
  SocketTokenResponse: {
    type: "object",
    properties: {
      token: {
        type: "string",
        description:
          'JWT efímero (~60 s, aud "socket") para socket.handshake.auth.token. No sirve como sesión HTTP.',
      },
    },
  },
};
