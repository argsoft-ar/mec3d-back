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
  "/productos/{id}": {
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
