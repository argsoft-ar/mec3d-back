export const productPaths = {
  "/productos": {
    get: {
      tags: ["Productos"],
      summary: "Obtener todos los productos con paginación",
      parameters: [
        {
          name: "page",
          in: "query",
          schema: {
            type: "integer",
            default: 1,
          },
          description: "Número de página",
        },
        {
          name: "limit",
          in: "query",
          schema: {
            type: "integer",
            default: 12,
          },
          description: "Cantidad de productos por página",
        },
      ],
      responses: {
        200: {
          description: "Lista de productos paginada",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PaginatedProductResponse",
              },
            },
          },
        },
      },
    },
    post: {
      tags: ["Productos"],
      summary: "Crear un nuevo producto",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateProductDTO",
            },
          },
        },
      },
      responses: {
        201: {
          description: "Producto creado exitosamente",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/Product" },
                },
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
      },
    },
  },
  "/productos/mis-disenos": {
    get: {
      tags: ["Productos"],
      summary: "Obtener mis productos como diseñador",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Lista de mis productos",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Product" },
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
      },
    },
  },
  "/productos/{id}/preview-publico": {
    get: {
      tags: ["Productos"],
      summary: "Vista previa 3D degradada (pública, sin login)",
      description:
        "Devuelve una URL firmada de vida corta de un STL simplificado (pocos miles de triángulos). Nunca expone el archivo original. 404 si el diseño no existe, está eliminado, es un plano técnico o aún no tiene preview.",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        200: {
          description: "URL firmada del preview degradado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  url: { type: "string", format: "uri" },
                  expiresIn: {
                    type: "integer",
                    description: "Segundos de vigencia de la URL",
                    example: 300,
                  },
                  format: { type: "string", enum: ["stl"] },
                },
              },
            },
          },
        },
        400: {
          description: "El id no es un UUID válido",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
        404: {
          description:
            "Diseño inexistente, eliminado, plano técnico o sin preview",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
        429: {
          description: "Demasiadas solicitudes",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
      },
    },
  },
  "/productos/{id}": {
    get: {
      tags: ["Productos"],
      summary: "Obtener un producto por id (público)",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        200: {
          description: "Producto (misma forma que cada ítem del listado)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Product" },
            },
          },
        },
        400: {
          description: "El id no es un UUID válido",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
        404: {
          description: "Producto no encontrado o eliminado",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        },
      },
    },
    put: {
      tags: ["Productos"],
      summary: "Actualizar un producto completo",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateProductDTO",
            },
          },
        },
      },
      responses: {
        200: {
          description: "Producto actualizado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/Product" },
                },
              },
            },
          },
        },
        403: {
          description: "No autorizado para modificar este producto",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        404: {
          description: "Producto no encontrado",
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
    patch: {
      tags: ["Productos"],
      summary: "Actualizar parcialmente un producto",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/PartialUpdateProductDTO",
            },
          },
        },
      },
      responses: {
        200: {
          description: "Producto modificado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/Product" },
                },
              },
            },
          },
        },
        403: {
          description: "No autorizado para modificar este producto",
        },
        404: {
          description: "Producto no encontrado",
        },
      },
    },
    delete: {
      tags: ["Productos"],
      summary: "Eliminar un producto",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        200: {
          description: "Producto eliminado exitosamente",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
        403: {
          description: "No autorizado para eliminar este producto",
        },
        404: {
          description: "Producto no encontrado",
        },
      },
    },
  },
};
