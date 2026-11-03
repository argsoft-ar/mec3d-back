const err = (description: string) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
  },
});

const uuidParam = {
  name: "id",
  in: "path",
  required: true,
  description: "ID de la orden de fabricación",
  schema: { type: "string", format: "uuid" },
};

const bearer = [{ bearerAuth: [] }];

const estadoOrden = {
  type: "string",
  enum: [
    "solicitado",
    "en_negociacion",
    "trato_cerrado",
    "confirmada",
    "en_disputa",
    "rechazado",
    "cancelado",
    "completado",
  ],
};

const codigosZona = (name: string, description: string) => ({
  name,
  in: "query",
  required: false,
  description: `${description} Parámetro repetido (?${name}=a&${name}=b) o separado por coma (?${name}=a,b); hasta 50 valores.`,
  style: "form",
  explode: true,
  schema: { type: "array", items: { type: "string", pattern: "^\\d+$" } },
});

export const ordenFabricacionSchemaDoc = {
  FabricanteSugerido: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      zonaId: {
        type: "integer",
        nullable: true,
        description:
          "Código INDEC de localidad censal (INTEGER: provincias 01-09 pierden el cero inicial)",
        example: 6441030,
      },
      georefLocalidadId: {
        type: "string",
        nullable: true,
        example: "06441030000",
      },
      puntuacion: { type: "number", example: 4.5 },
      tagline: { type: "string", nullable: true },
      username: { type: "string", nullable: true },
    },
  },
  OrdenDiseno: {
    type: "object",
    properties: {
      ordenId: { type: "string", format: "uuid" },
      estado: estadoOrden,
      material: {
        type: "string",
        nullable: true,
        description: "Material pedido en la compra",
      },
      diseno: {
        type: "object",
        description: "Nunca incluye archivoUrl",
        properties: {
          id: { type: "string", format: "uuid" },
          titulo: { type: "string" },
          descripcion: { type: "string", nullable: true },
          imagenUrl: { type: "string", nullable: true },
          previewUrl: {
            type: "string",
            nullable: true,
            description:
              "Ruta del preview degradado público (GET /productos/{id}/preview-publico); null si no hay preview o es plano técnico",
            example:
              "/api/v1/productos/4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f/preview-publico",
          },
          categoria: { type: "string", nullable: true },
          tecnologia: { type: "string", nullable: true },
          materiales: { type: "array", items: { type: "string" } },
          formato: { type: "string", nullable: true },
          pesoGramos: { type: "integer", nullable: true },
          especificaciones: {
            type: "object",
            nullable: true,
            properties: {
              dimensiones: { type: "string" },
              dificultad: { type: "string" },
              tiempoImpresion: { type: "integer" },
              soportes: { type: "string" },
              configuracion: {
                type: "object",
                properties: {
                  layer: { type: "string" },
                  infill: { type: "string" },
                },
              },
            },
          },
        },
      },
      puedeDescargar: {
        type: "boolean",
        description:
          "true solo si el usuario es el fabricante, la orden está en trato_cerrado o confirmada y la compra está pagada (mismas reglas que GET /ordenes-fabricacion/{id}/descargar-diseno)",
      },
    },
  },
  OrdenCerradaFabricante: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      compraId: { type: "string", format: "uuid" },
      estado: {
        type: "string",
        enum: ["trato_cerrado", "confirmada", "completado"],
      },
      disenoId: { type: "string", format: "uuid" },
      disenoTitulo: { type: "string" },
      disenoImagenUrl: { type: "string", nullable: true },
      compradorUsername: { type: "string", nullable: true },
      precioAcordado: {
        type: "number",
        nullable: true,
        description: "Pesos",
        example: 10000,
      },
      material: { type: "string", nullable: true },
      fechaCierre: { type: "string", format: "date-time", nullable: true },
      actualizadoEn: {
        type: "string",
        format: "date-time",
        nullable: true,
        description:
          "Última transición (cierre, entrega declarada o confirmada)",
      },
      conversacionId: { type: "string", format: "uuid", nullable: true },
    },
  },
};

export const ordenFabricacionPaths = {
  "/ordenes-fabricacion/fabricantes-sugeridos": {
    get: {
      tags: ["Fabricación"],
      summary: "Fabricantes compatibles para una compra de fabricación",
      description:
        "Solo el comprador dueño de la compra. Filtra por tecnología/material compatibles y, opcionalmente, por zonas con semántica de refinamiento: un nivel más específico reemplaza a su ancestro. Se descarta una provincia si algún departamento o localidad elegidos empieza con su código, y un departamento si alguna localidad elegida (censal de 8 o Georef de 11 dígitos) empieza con su código. Los códigos restantes se combinan con OR (p. ej. provincias=06,14 + departamentos=06441 → departamento 06441 O provincia 14). La ubicación del fabricante sale de zona_id (localidad o departamento INDEC, restaurando el cero inicial) y de georef_localidad_id (sus 2/5/8 primeros dígitos son provincia/departamento/localidad censal); basta que coincida cualquiera de los dos. Sin filtros de zona no se filtra por ubicación. Orden: misma zona del diseñador, misma provincia, resto; luego puntuación.",
      security: bearer,
      parameters: [
        {
          name: "disenoId",
          in: "query",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
        {
          name: "compraId",
          in: "query",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
        { name: "material", in: "query", schema: { type: "string" } },
        codigosZona(
          "provincias",
          "Códigos INDEC de provincia (1-2 dígitos, se completa el cero inicial).",
        ),
        codigosZona(
          "departamentos",
          "Códigos INDEC de departamento/partido (4-5 dígitos).",
        ),
        codigosZona(
          "localidades",
          "Localidad censal INDEC (7-8 dígitos) o id Georef/BAHRA (10-11 dígitos).",
        ),
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, default: 1 },
        },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 50, default: 50 },
        },
      ],
      responses: {
        200: {
          description: "Listado (array) de fabricantes",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/FabricanteSugerido" },
              },
            },
          },
        },
        400: err("Parámetros inválidos (incluye códigos de zona mal formados)"),
        401: err("Token ausente o inválido"),
        403: err("La compra no es del usuario"),
        404: err("Compra o diseño no encontrado"),
        409: err("La compra no admite nuevas solicitudes"),
      },
    },
  },
  "/ordenes-fabricacion/fabricante/cerradas": {
    get: {
      tags: ["Fabricación"],
      summary: "Dashboard del fabricante: órdenes cerradas",
      description:
        "Órdenes del fabricante autenticado en trato_cerrado, confirmada o completado, de la más reciente a la más antigua. El rol se verifica contra la base.",
      security: bearer,
      parameters: [
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, default: 1 },
        },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 12 },
        },
      ],
      responses: {
        200: {
          description: "Listado paginado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  data: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/OrdenCerradaFabricante",
                    },
                  },
                  meta: { $ref: "#/components/schemas/PaginationMeta" },
                },
              },
            },
          },
        },
        400: err("Parámetros de paginación inválidos"),
        401: err("Token ausente o inválido"),
        403: err("Solo los fabricantes pueden ver sus órdenes cerradas"),
      },
    },
  },
  "/ordenes-fabricacion/{id}/diseno": {
    get: {
      tags: ["Fabricación"],
      summary: "Especificaciones del diseño de una orden",
      description:
        "Solo el comprador o el fabricante de la orden. Nunca devuelve archivoUrl; el archivo se descarga con GET /ordenes-fabricacion/{id}/descargar-diseno.",
      security: bearer,
      parameters: [uuidParam],
      responses: {
        200: {
          description: "Diseño de la orden",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/OrdenDiseno" },
                },
              },
            },
          },
        },
        400: err("ID inválido"),
        401: err("Token ausente o inválido"),
        403: err("No autorizado para operar sobre esta orden de fabricación"),
        404: err("Orden de fabricación no encontrada"),
      },
    },
  },
  "/ordenes-fabricacion/{id}/descargar-diseno": {
    get: {
      tags: ["Fabricación"],
      summary: "Descargar el archivo del diseño (fabricante)",
      description:
        "Solo el fabricante de la orden, con la orden en trato_cerrado o confirmada y la compra pagada. Redirige (302, Cache-Control: no-store) a una URL firmada de vida corta.",
      security: bearer,
      parameters: [uuidParam],
      responses: {
        302: { description: "Redirección a la URL firmada" },
        400: err("ID inválido"),
        401: err("Token ausente o inválido"),
        403: err("No autorizado para descargar este archivo"),
        404: err("Orden de fabricación no encontrada"),
        409: err(
          "El archivo solo está disponible mientras la orden está en curso / el pago todavía no fue acreditado",
        ),
      },
    },
  },
};
