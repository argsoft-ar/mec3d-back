export const productSchemaDoc = {
  ProductSpecificaciones: {
    type: "object",
    properties: {
      material: { type: "string", example: "PLA" },
      dimensiones: { type: "string", example: "100x50x30mm" },
      dificultad: {
        type: "string",
        enum: ["Básico", "Intermedio", "Avanzado"],
      },
      tiempoImpresion: { type: "string", example: "4 horas" },
      soportes: { type: "string", enum: ["Necesarios", "No necesarios"] },
      configuracion: {
        type: "object",
        properties: {
          layer: {
            type: "string",
            enum: ["0.1mm", "0.15mm", "0.2mm", "0.3mm"],
          },
          infill: {
            type: "string",
            enum: ["15%", "20%", "25%", "30%", "40%", "50%", "60%"],
          },
        },
      },
    },
  },
  ProductDesigner: {
    type: "object",
    properties: {
      initials: { type: "string", example: "JD" },
      name: { type: "string", example: "John Doe" },
      tagline: { type: "string", example: "Diseñador 3D" },
    },
  },
  Product: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      designerId: { type: "string", format: "uuid" },
      title: { type: "string", example: "Soporte para celular" },
      description: { type: "string", example: "Soporte ergonómico ajustable" },
      imageUrl: { type: "string", format: "uri" },
      rating: { type: "number", example: 4.5 },
      reviewCount: { type: "integer", example: 128 },
      downloads: { type: "integer", example: 500 },
      price: { type: "number", example: 2500 },
      format: { type: "string", example: "STL" },
      categoria: { type: "string", example: "Decoración" },
      specs: { $ref: "#/components/schemas/ProductSpecificaciones" },
      designer: { $ref: "#/components/schemas/ProductDesigner" },
    },
  },
  CreateProductDTO: {
    type: "object",
    required: ["titulo", "archivoUrl", "precioBase"],
    properties: {
      titulo: { type: "string", minLength: 3, example: "Soporte para celular" },
      descripcion: { type: "string", example: "Soporte ergonómico ajustable" },
      imagenUrl: { type: "string", format: "uri" },
      archivoUrl: { type: "string", format: "uri" },
      precioBase: { type: "number", example: 2500 },
      formato: { type: "string", example: "STL" },
      categoria: { type: "string", example: "Decoración" },
      especificaciones: { $ref: "#/components/schemas/ProductSpecificaciones" },
    },
  },
  PartialUpdateProductDTO: {
    type: "object",
    properties: {
      titulo: { type: "string", minLength: 3 },
      descripcion: { type: "string" },
      imagenUrl: { type: "string", format: "uri" },
      archivoUrl: { type: "string", format: "uri" },
      precioBase: { type: "number" },
      formato: { type: "string" },
      categoria: { type: "string" },
      especificaciones: { $ref: "#/components/schemas/ProductSpecificaciones" },
    },
  },
};
