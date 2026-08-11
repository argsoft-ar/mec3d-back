export const paginationSchemaDoc = {
  PaginationMeta: {
    type: "object",
    properties: {
      page: { type: "integer", example: 1 },
      limit: { type: "integer", example: 12 },
      total: { type: "integer", example: 150 },
      totalPages: { type: "integer", example: 13 },
    },
  },
  PaginatedProductResponse: {
    type: "object",
    properties: {
      data: {
        type: "array",
        items: { $ref: "#/components/schemas/Product" },
      },
      meta: { $ref: "#/components/schemas/PaginationMeta" },
    },
  },
};
