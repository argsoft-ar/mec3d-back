// Montos siempre en centavos enteros de ARS (excepto precioPagado, en pesos solo para mostrar).
const err = (description: string) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
  },
});

const uuidParam = (description: string) => ({
  name: "id",
  in: "path",
  required: true,
  description,
  schema: { type: "string", format: "uuid" },
});

const cookieSession = [{ cookieAuth: [] }];

export const pagoSchemaDoc = {
  Compra: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      idComprador: { type: "string", format: "uuid" },
      idModelo: { type: "string", format: "uuid" },
      idDisenador: { type: "string", format: "uuid" },
      tipo: { type: "string", enum: ["descarga", "fabricacion"] },
      estado: {
        type: "string",
        enum: [
          "pendiente_pago",
          "pagada",
          "completada",
          "reembolsada",
          "cancelada",
        ],
      },
      montoCentavos: {
        type: "integer",
        nullable: true,
        description: "null en fabricación hasta cerrarse el trato",
        example: 250000,
      },
      moneda: { type: "string", example: "ARS" },
      precioPagado: { type: "number", nullable: true, example: 2500 },
      fecha: { type: "string", format: "date-time" },
      pagadaEn: { type: "string", format: "date-time", nullable: true },
      entregaConfirmada: { type: "boolean" },
      entregadoEn: { type: "string", format: "date-time", nullable: true },
      fondosLiberados: { type: "boolean" },
      fondosLiberadosEn: {
        type: "string",
        format: "date-time",
        nullable: true,
      },
      material: { type: "string", nullable: true },
    },
  },
  PagoResumen: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      estado: {
        type: "string",
        enum: ["pendiente", "aprobado", "rechazado", "reembolsado"],
      },
      mpStatus: { type: "string", nullable: true, example: "approved" },
      montoCentavos: { type: "integer", example: 250000 },
      moneda: { type: "string", example: "ARS" },
      reembolsoPendiente: { type: "boolean" },
      creadoEn: { type: "string", format: "date-time" },
      aprobadoEn: { type: "string", format: "date-time", nullable: true },
    },
  },
  EstadoPago: {
    type: "object",
    properties: {
      compraId: { type: "string", format: "uuid" },
      tipo: { type: "string", enum: ["descarga", "fabricacion"] },
      estadoCompra: {
        type: "string",
        enum: [
          "pendiente_pago",
          "pagada",
          "completada",
          "reembolsada",
          "cancelada",
        ],
      },
      montoCentavos: { type: "integer", nullable: true },
      moneda: { type: "string", example: "ARS" },
      pago: {
        allOf: [{ $ref: "#/components/schemas/PagoResumen" }],
        nullable: true,
      },
    },
  },
  MovimientoBilletera: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      tipo: {
        type: "string",
        enum: ["regalia_disenador", "pago_fabricante", "pago_disenador"],
      },
      estado: {
        type: "string",
        enum: ["retenido", "pendiente_payout", "pagado"],
      },
      montoCentavos: { type: "integer", example: 873000 },
      compraId: { type: "string", format: "uuid" },
      ordenId: { type: "string", format: "uuid", nullable: true },
      creadoEn: { type: "string", format: "date-time" },
      liberadoEn: { type: "string", format: "date-time", nullable: true },
      pagadoEn: { type: "string", format: "date-time", nullable: true },
    },
  },
  Billetera: {
    type: "object",
    properties: {
      data: {
        type: "array",
        items: { $ref: "#/components/schemas/MovimientoBilletera" },
      },
      meta: { $ref: "#/components/schemas/PaginationMeta" },
      resumen: {
        type: "object",
        properties: {
          retenidoCentavos: { type: "integer" },
          pendientePayoutCentavos: { type: "integer" },
          pagadoCentavos: { type: "integer" },
          cuentaMercadopagoConfigurada: { type: "boolean" },
        },
      },
    },
  },
  PayoutPendiente: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      tipo: { type: "string" },
      montoCentavos: { type: "integer" },
      compraId: { type: "string", format: "uuid" },
      ordenId: { type: "string", format: "uuid", nullable: true },
      liberadoEn: { type: "string", format: "date-time", nullable: true },
      usuario: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string" },
          cuentaMercadopago: { type: "string", nullable: true },
        },
      },
    },
  },
};

export const pagoPaths = {
  "/compras": {
    post: {
      tags: ["Pagos"],
      summary: "Crear una compra (descarga o ancla de fabricación)",
      description:
        "descarga: crea la compra 'pendiente_pago' con monto = precio del diseño y devuelve el initPoint de Checkout Pro. Si el comprador ya tiene una descarga 'pendiente_pago' de ese diseño, la reutiliza (nuevo initPoint, misma respuesta); si ya la tiene pagada o completada responde 409 con code COMPRA_DUPLICADA. fabricacion: solo crea la compra (monto null, initPoint null); el pago se habilita al cerrarse el trato. El monto nunca viene del cliente. Los diseños de la categoría \"Planos técnicos\" solo admiten tipo descarga (fabricacion responde 400).",
      security: cookieSession,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["disenoId", "tipo"],
              properties: {
                disenoId: { type: "string", format: "uuid" },
                tipo: { type: "string", enum: ["descarga", "fabricacion"] },
                material: {
                  type: "string",
                  description:
                    "Solo fabricación; uno de los materiales del diseño",
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Compra creada",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  compra: { $ref: "#/components/schemas/Compra" },
                  initPoint: {
                    type: "string",
                    nullable: true,
                    example:
                      "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
                  },
                },
              },
            },
          },
        },
        400: err(
          "Datos inválidos, o fabricación solicitada sobre un plano técnico",
        ),
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
        404: err("Diseño no encontrado"),
        409: err(
          "Compra de descarga duplicada (code COMPRA_DUPLICADA: el diseño ya fue comprado) o compra del propio diseño",
        ),
        429: err("Demasiados intentos de pago"),
        502: err("No se pudo crear la preference en Mercado Pago"),
        503: err("Pagos no configurados"),
      },
    },
  },
  "/compras/diseno/{disenoId}/estado": {
    get: {
      tags: ["Pagos"],
      summary: "Estado de la compra de descarga del usuario sobre un diseño",
      description:
        "Solo considera descargas activas (pendiente_pago, pagada, completada) del usuario autenticado; prioriza la cobrada. comprado = true solo si está pagada o completada.",
      security: cookieSession,
      parameters: [
        {
          name: "disenoId",
          in: "path",
          required: true,
          description: "ID del diseño",
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        200: {
          description: "Estado de la compra",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  comprado: { type: "boolean" },
                  compraId: { type: "string", format: "uuid", nullable: true },
                  estado: {
                    type: "string",
                    nullable: true,
                    enum: ["pendiente_pago", "pagada", "completada", null],
                  },
                },
              },
            },
          },
        },
        400: err("disenoId inválido"),
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
      },
    },
  },
  "/compras/{id}/pagar": {
    post: {
      tags: ["Pagos"],
      summary: "Nuevo intento de pago de una compra pendiente",
      description:
        "Para reintentar (preference vencida o abandonada) o, en fabricación, cuando cerró el fabricante el trato. Solo el comprador dueño. En fabricación exige trato cerrado y monto igual al precio acordado.",
      security: cookieSession,
      parameters: [uuidParam("ID de la compra")],
      responses: {
        201: {
          description: "Preference creada",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  pagoId: { type: "string", format: "uuid" },
                  initPoint: { type: "string" },
                },
              },
            },
          },
        },
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
        403: err("La compra no es del usuario"),
        404: err("Compra no encontrada"),
        409: err(
          "La compra no está pendiente de pago (p. ej. cancelada) o el trato no está cerrado",
        ),
        502: err("No se pudo crear la preference en Mercado Pago"),
        503: err("Pagos no configurados"),
      },
    },
  },
  "/compras/{id}/cancelar": {
    post: {
      tags: ["Pagos"],
      summary: "Cancelar una compra pendiente de pago",
      description:
        "Solo el comprador dueño y solo con la compra en 'pendiente_pago' sin pagos aprobados. La compra pasa a 'cancelada' (deja de aparecer en mis-compras), sus intentos de pago pendientes quedan 'rechazado' y un cobro tardío de Mercado Pago sobre esa preference se reembolsa automáticamente (nunca se acredita). En fabricación cancela todas las órdenes abiertas (solicitado, en_negociacion, trato_cerrado) y publica un mensaje de sistema en cada conversación (eventos socket 'orden-cancelada' y 'notificacion-mensaje').",
      security: cookieSession,
      parameters: [uuidParam("ID de la compra")],
      responses: {
        200: {
          description: "Compra cancelada",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Compra cancelada" },
                  data: {
                    type: "object",
                    properties: {
                      compraId: { type: "string", format: "uuid" },
                      estado: { type: "string", enum: ["cancelada"] },
                    },
                  },
                },
              },
            },
          },
        },
        400: err("id inválido"),
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
        403: err("La compra no es del usuario"),
        404: err("Compra no encontrada"),
        409: err(
          "code COMPRA_NO_CANCELABLE: la compra no está 'pendiente_pago' o ya tiene un pago aprobado",
        ),
        429: err("Demasiados intentos"),
      },
    },
  },
  "/compras/{id}/estado-pago": {
    get: {
      tags: ["Pagos"],
      summary: "Estado de la compra y de su último pago",
      description:
        "Solo el dueño de la compra. El front lo consulta al volver de Checkout Pro (la fuente de verdad es el webhook, no el redirect).",
      security: cookieSession,
      parameters: [uuidParam("ID de la compra")],
      responses: {
        200: {
          description: "Estado de pago",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EstadoPago" },
            },
          },
        },
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
        403: err("La compra no es del usuario"),
        404: err("Compra no encontrada"),
      },
    },
  },
  "/webhooks/mercadopago": {
    post: {
      tags: ["Pagos"],
      summary: "Webhook de Mercado Pago (público)",
      description:
        "Sin JWT: se autentica con x-signature (HMAC-SHA256 de 'id:<data.id>;request-id:<x-request-id>;ts:<ts>;', timing-safe, tolerancia 5 min). Re-consulta el pago a la API de MP y valida external_reference, monto y moneda ARS. Idempotente: un evento ya procesado responde 200 'duplicado'. Un error interno responde 5xx para que MP reintente.",
      security: [],
      parameters: [
        { name: "data.id", in: "query", schema: { type: "string" } },
        {
          name: "type",
          in: "query",
          schema: { type: "string", example: "payment" },
        },
        {
          name: "x-signature",
          in: "header",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "x-request-id",
          in: "header",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: true },
          },
        },
      },
      responses: {
        200: {
          description: "Procesado, ignorado, rechazado o duplicado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  resultado: {
                    type: "string",
                    enum: ["procesado", "duplicado", "ignorado", "rechazado"],
                  },
                },
              },
            },
          },
        },
        401: err("Firma inválida, ausente o vencida"),
        429: err("Rate limit"),
        503: err("Pagos no configurados"),
      },
    },
  },
  "/usuarios/mi-billetera": {
    get: {
      tags: ["Pagos"],
      summary: "Billetera del usuario autenticado",
      description:
        "Movimientos propios (retenido, pendiente_payout, pagado) paginados y resumen en centavos. Nunca expone movimientos de otros usuarios ni de la plataforma.",
      security: cookieSession,
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
        {
          name: "estado",
          in: "query",
          schema: {
            type: "string",
            enum: ["retenido", "pendiente_payout", "pagado"],
          },
        },
      ],
      responses: {
        200: {
          description: "Billetera",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Billetera" },
            },
          },
        },
        400: err("Parámetros inválidos"),
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
      },
    },
  },
  "/ordenes-fabricacion/{id}/cerrar-trato": {
    post: {
      tags: ["Fabricación"],
      summary: "Aceptar el presupuesto del fabricante (solo comprador)",
      description:
        "Solo el comprador. Acepta el último precio propuesto por el fabricante (precio_propuesto_fabricante) y cierra el trato en el acto, sin confirmación del fabricante: la orden pasa a trato_cerrado, se fija el monto de la compra, se cancelan las órdenes hermanas, se genera el código de entrega y se emite 'deal-closed'. `precio` debe coincidir con la propuesta vigente (evita aceptar un monto desactualizado). La respuesta incluye el initPoint de Checkout Pro; si es null, el comprador usa POST /compras/{id}/pagar. El fabricante solo propone precio con POST /ordenes-fabricacion/{id}/proponer-precio; el comprador puede contraofertar por esa vía, pero eso no cierra el trato.",
      security: cookieSession,
      parameters: [uuidParam("ID de la orden de fabricación")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["precio"],
              properties: {
                precio: {
                  type: "number",
                  description:
                    "Pesos, hasta 2 decimales; debe ser igual al presupuesto vigente del fabricante",
                  example: 10000,
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Presupuesto aceptado, trato cerrado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Presupuesto aceptado, trato cerrado",
                  },
                  data: {
                    type: "object",
                    description:
                      "Orden de fabricación (estado trato_cerrado, cerradoPorComprador y cerradoPorFabricante en true)",
                  },
                  pagoRequerido: { type: "boolean", example: true },
                  initPoint: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        400: err("Datos inválidos o diseño en categoría de planos técnicos"),
        403: err(
          "No participa de la orden, o es el fabricante: 'Solo el comprador puede aceptar el presupuesto'",
        ),
        404: err("Orden de fabricación no encontrada"),
        409: err(
          "code SIN_PRESUPUESTO (el fabricante no propuso precio), code PRESUPUESTO_DESACTUALIZADO (precio distinto al vigente), trato ya cerrado, o la orden/compra ya no admiten el cierre",
        ),
      },
    },
  },
  "/ordenes-fabricacion/{id}/cancelar": {
    post: {
      tags: ["Fabricación"],
      summary: "Cancelar una orden antes de declararse la entrega",
      description:
        "Con trato cerrado y pago acreditado, la compra pasa a 'cancelada' y se reembolsa el pago en Mercado Pago. 'reembolso' = no_aplica | reembolsado | pendiente (pendiente se reintenta desde el panel admin).",
      security: cookieSession,
      parameters: [uuidParam("ID de la orden de fabricación")],
      responses: {
        200: {
          description: "Orden cancelada",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  data: { type: "object" },
                  reembolso: {
                    type: "string",
                    enum: ["no_aplica", "reembolsado", "pendiente"],
                  },
                },
              },
            },
          },
        },
        403: err("No participa de la orden"),
        404: err("Orden no encontrada"),
        409: err("La orden ya no puede cancelarse"),
      },
    },
  },
  "/admin/payouts/pendientes": {
    get: {
      tags: ["Admin"],
      summary: "Payouts pendientes de transferir a vendedores",
      security: cookieSession,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 12, maximum: 100 },
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
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/PayoutPendiente" },
                  },
                  meta: { $ref: "#/components/schemas/PaginationMeta" },
                },
              },
            },
          },
        },
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
        403: err("Requiere rol admin"),
      },
    },
  },
  "/admin/payouts/{id}/marcar-pagado": {
    post: {
      tags: ["Admin"],
      summary: "Registrar un payout manual ya transferido",
      security: cookieSession,
      parameters: [uuidParam("ID del movimiento")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["referencia"],
              properties: {
                referencia: {
                  type: "string",
                  maxLength: 255,
                  example: "Transferencia 0001234",
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Movimiento marcado como pagado" },
        400: err("Datos inválidos"),
        403: err("Requiere rol admin"),
        404: err("Movimiento no encontrado"),
        409: err("El movimiento no está pendiente de payout"),
      },
    },
  },
  "/admin/pagos/reembolsos-pendientes/reintentar": {
    post: {
      tags: ["Admin"],
      summary: "Reintentar los reembolsos que no se pudieron confirmar en MP",
      security: cookieSession,
      responses: {
        200: {
          description: "Resumen del reintento",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  intentados: { type: "integer" },
                  reembolsados: { type: "integer" },
                  pendientes: { type: "integer" },
                },
              },
            },
          },
        },
        403: err("Requiere rol admin"),
      },
    },
  },
};
