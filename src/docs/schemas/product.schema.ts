export const productSchemaDoc = {
  ProductSpecificaciones: {
    type: "object",
    properties: {
      dimensiones: { type: "string", example: "100x50x30mm" },
      dificultad: {
        type: "string",
        enum: ["Básico", "Intermedio", "Avanzado"],
      },
      tiempoImpresion: {
        type: "integer",
        minimum: 1,
        maximum: 500,
        description: "Horas de impresión (3D) o fabricación (CNC)",
        example: 4,
      },
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
      tecnologia: {
        type: "string",
        nullable: true,
        description: "null en planos técnicos sin tecnología",
        example: "Impresión 3D",
      },
      materiales: {
        type: "array",
        items: { type: "string" },
        description: "Vacío en planos técnicos sin materiales",
        example: ["PLA", "PETG"],
      },
      specs: { $ref: "#/components/schemas/ProductSpecificaciones" },
      designer: { $ref: "#/components/schemas/ProductDesigner" },
    },
  },
  CreateProductDTO: {
    type: "object",
    description:
      'Si `categoria` es "Planos técnicos": `formato` es obligatorio y debe ser PDF, DWG o DXF; `tecnologia`, `materiales` y `especificaciones` son opcionales (los materiales requieren tecnología). Para el resto de las categorías `tecnologia` y `materiales` son obligatorios.',
    required: ["titulo", "archivoUrl", "precioBase"],
    properties: {
      titulo: { type: "string", minLength: 3, example: "Soporte para celular" },
      descripcion: { type: "string", example: "Soporte ergonómico ajustable" },
      imagenUrl: { type: "string", format: "uri" },
      archivoUrl: { type: "string", format: "uri" },
      precioBase: {
        type: "number",
        exclusiveMinimum: 0,
        maximum: 10000000,
        multipleOf: 0.01,
        example: 2500,
      },
      formato: {
        type: "string",
        description:
          "En planos técnicos: PDF, DWG o DXF (obligatorio, en mayúsculas)",
        example: "STL",
      },
      categoria: {
        type: "string",
        description:
          'Nombre de una categoría del catálogo; "Planos técnicos" activa las reglas de planos',
        example: "Decoración",
      },
      tecnologia: {
        type: "string",
        description:
          "Nombre de una tecnología del catálogo (GET /catalogos/tecnologias). Obligatoria salvo en planos técnicos",
        example: "Impresión 3D",
      },
      materiales: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
        items: { type: "string" },
        description:
          "Nombres de materiales del catálogo, todos de la tecnología indicada. Obligatorios salvo en planos técnicos",
        example: ["PLA", "PETG"],
      },
      especificaciones: { $ref: "#/components/schemas/ProductSpecificaciones" },
    },
  },
  PartialUpdateProductDTO: {
    type: "object",
    description:
      "Si cambia `tecnologia` debe enviarse también `materiales` compatibles. Las reglas de planos técnicos (formato PDF/DWG/DXF; tecnología y materiales obligatorios fuera de esa categoría) se validan sobre el estado resultante del diseño.",
    properties: {
      titulo: { type: "string", minLength: 3 },
      descripcion: { type: "string" },
      imagenUrl: { type: "string", format: "uri" },
      archivoUrl: { type: "string", format: "uri" },
      precioBase: {
        type: "number",
        exclusiveMinimum: 0,
        maximum: 10000000,
        multipleOf: 0.01,
      },
      formato: { type: "string" },
      categoria: { type: "string" },
      tecnologia: { type: "string", example: "Impresión 3D" },
      materiales: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
        items: { type: "string" },
      },
      especificaciones: { $ref: "#/components/schemas/ProductSpecificaciones" },
    },
  },
};
