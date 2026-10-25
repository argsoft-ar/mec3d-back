export const uploadPaths = {
  "/archivos/modelo": {
    post: {
      tags: ["Archivos"],
      summary: "Subir un archivo de diseño (modelo 3D o plano técnico)",
      description:
        "Modelos 3D: STL, 3MF, OBJ, STEP/STP, hasta 10 MB. Planos técnicos: PDF, DWG o DXF, hasta 5 MB (el tipo se decide por la extensión). Se valida la firma del contenido: PDF empieza con `%PDF-`, DWG con `AC10`, DXF es ASCII (código de grupo + SECTION) o binario (`AutoCAD Binary DXF`).",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                archivo: { type: "string", format: "binary" },
              },
              required: ["archivo"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Archivo subido; `url` va en `archivoUrl` del producto",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  url: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        400: {
          description:
            "Archivo ausente, extensión/tipo no permitido, firma inválida o tamaño excedido",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
        401: {
          description: "No autorizado",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
        429: {
          description:
            "Demasiadas subidas (límite de tasa) o demasiadas subidas simultáneas en curso (por usuario y global)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
      },
    },
  },
  "/archivos/imagen": {
    post: {
      tags: ["Archivos"],
      summary: "Subir una imagen",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                imagen: {
                  type: "string",
                  format: "binary",
                  description: "Archivo de imagen (jpg, png, webp)",
                },
              },
              required: ["imagen"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Imagen subida exitosamente",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Imagen subida exitosamente",
                  },
                  url: {
                    type: "string",
                    format: "uri",
                    example: "https://res.cloudinary.com/...",
                  },
                },
              },
            },
          },
        },
        400: {
          description: "No se ha enviado ninguna imagen",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        401: {
          description: "No autorizado",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        429: {
          description:
            "Demasiadas subidas (límite de tasa) o demasiadas subidas simultáneas en curso (por usuario y global)",
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
