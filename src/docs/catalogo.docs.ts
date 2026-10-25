export const catalogoPaths = {
  "/catalogos/tecnologias": {
    get: {
      tags: ["Catálogos"],
      summary: "Listar tecnologías de fabricación",
      responses: {
        200: {
          description: "Tecnologías del catálogo",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer", example: 2 },
                    nombre: { type: "string", example: "Impresión 3D" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/catalogos/materiales": {
    get: {
      tags: ["Catálogos"],
      summary: "Listar materiales (opcionalmente de una tecnología)",
      parameters: [
        {
          name: "tecnologiaId",
          in: "query",
          required: false,
          schema: { type: "integer" },
        },
      ],
      responses: {
        200: {
          description: "Materiales del catálogo",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer", example: 1 },
                    nombre: { type: "string", example: "PLA" },
                    tecnologiaId: { type: "integer", example: 2 },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "tecnologiaId inválido",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
      },
    },
  },
};
