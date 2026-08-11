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
    required: ["email", "password", "rolPrincipal"],
    properties: {
      email: {
        type: "string",
        format: "email",
        example: "usuario@ejemplo.com",
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
    properties: {
      message: { type: "string", example: "Login exitoso" },
      token: { type: "string" },
      user: { $ref: "#/components/schemas/UserResponse" },
    },
  },
};
