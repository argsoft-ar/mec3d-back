export const errorSchemaDoc = {
  ApiError: {
    type: "object",
    properties: {
      error: { type: "string", example: "Error message" },
      code: {
        type: "string",
        description: "Código estable de algunos errores (ej. COMPRA_DUPLICADA)",
      },
      details: { type: "object" },
    },
  },
  ValidationError: {
    type: "object",
    properties: {
      error: { type: "string", example: "Error de validación" },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "array", items: { type: "string" } },
            message: { type: "string" },
          },
        },
      },
    },
  },
};
