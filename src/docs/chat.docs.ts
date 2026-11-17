const err = (description: string) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
  },
});

const cookieSession = [{ cookieAuth: [] }];

export const chatSchemaDoc = {
  CerrarConversacionResultado: {
    type: "object",
    properties: {
      conversacionId: { type: "string", format: "uuid" },
      ordenEstado: {
        type: "string",
        enum: ["cancelado", "rechazado", "completado"],
        description:
          "Estado de la orden tras el cierre: 'cancelado' si cerró el comprador durante la negociación, 'rechazado' si cerró el fabricante; si la orden ya había terminado se devuelve su estado sin cambios",
      },
    },
  },
};

export const chatPaths = {
  "/conversaciones/{id}/cerrar": {
    post: {
      tags: ["Chat"],
      summary: "Cerrar una conversación (solo para el usuario autenticado)",
      description:
        "Solo el comprador o el fabricante de la conversación. El cierre es por usuario y soft: la conversación deja de aparecer en GET /conversaciones/mias y en /no-leidos, y su historial devuelve 404 para quien la cerró (los mensajes se conservan). Con la orden en 'solicitado' o 'en_negociacion' el cierre cancela la orden en la misma transacción ('cancelado' si cierra el comprador, 'rechazado' si cierra el fabricante), deja un mensaje de sistema y emite por socket 'orden-cancelada' (room de la conversación), 'notificacion-mensaje' y 'conversacion-cerrada' (room personal de la contraparte). Con la orden en 'completado', 'cancelado' o 'rechazado' solo oculta la conversación (así la contraparte elimina un chat que el otro cerró). Bloqueado con 'trato_cerrado', 'confirmada' o 'en_disputa'. Idempotente: repetirlo devuelve 200 sin efectos. Una vez cerrado por cualquiera de las partes, la conversación no admite mensajes nuevos.",
      security: cookieSession,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "ID de la conversación",
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        200: {
          description: "Conversación cerrada para el usuario",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Conversación cerrada" },
                  data: {
                    $ref: "#/components/schemas/CerrarConversacionResultado",
                  },
                },
              },
            },
          },
        },
        400: err("ID inválido"),
        401: err("Sesión (cookie mec3d_session) ausente o inválida"),
        403: err("No autorizado para ver esta conversación"),
        404: err("Conversación u orden de fabricación no encontrada"),
        409: err(
          "La orden tiene el trato cerrado sin entrega concretada o está en disputa (code CHAT_NO_CERRABLE)",
        ),
      },
    },
  },
};
