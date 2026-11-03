import { chatRepository } from "../repositories/chat.repository";
import { ForbiddenError, NotFoundError } from "../errors/app-error";
import { PaginatedResponse } from "../interfaces/pagination.interface";
import {
  Mensaje,
  ConversacionResumen,
  ConversacionLeida,
  NoLeidosTotal,
} from "../interfaces/chat.interface";

// Exportado: chat.socket.ts y orden-fabricacion.service.ts emiten mensajes por
// socket y necesitan el mismo mapeo snake_case -> camelCase que la API REST,
// o el front (que espera Mensaje camelCase) descarta el evento silenciosamente.
export function mapMensaje(row: any): Mensaje {
  return {
    id: row.id,
    conversacionId: row.conversacion_id,
    remitenteId: row.remitente_id,
    contenido: row.contenido,
    tipo: row.tipo,
    creadoEn: row.creado_en,
  };
}

function mapConversacionResumen(row: any, userId: string): ConversacionResumen {
  const miRol: "comprador" | "fabricante" =
    row.comprador_id === userId ? "comprador" : "fabricante";
  const contraparte =
    miRol === "comprador"
      ? {
          id: row.fabricante_id,
          username: row.fabricante_username,
          tagline: row.fabricante_tagline,
        }
      : {
          id: row.comprador_id,
          username: row.comprador_username,
          tagline: row.comprador_tagline,
        };

  return {
    id: row.id,
    ordenFabricacionId: row.orden_fabricacion_id,
    productoTitulo: row.producto_titulo ?? null,
    miRol,
    contraparte,
    estadoOrden: row.orden_estado,
    precioAcordado:
      row.precio_acordado !== null ? Number(row.precio_acordado) : null,
    precioPropuestoComprador:
      row.precio_propuesto_comprador !== null
        ? Number(row.precio_propuesto_comprador)
        : null,
    precioPropuestoFabricante:
      row.precio_propuesto_fabricante !== null
        ? Number(row.precio_propuesto_fabricante)
        : null,
    ultimoMensaje:
      row.ultimo_mensaje_contenido !== null
        ? {
            contenido: row.ultimo_mensaje_contenido,
            creadoEn: row.ultimo_mensaje_creado_en,
          }
        : null,
    noLeidos: Number(row.no_leidos ?? 0),
    creadoEn: row.creado_en,
  };
}

async function assertParticipante(
  conversacionId: string,
  userId: string,
): Promise<void> {
  const conversacion = await chatRepository.getById(conversacionId);
  if (!conversacion) {
    throw new NotFoundError("Conversación no encontrada");
  }
  if (
    conversacion.comprador_id !== userId &&
    conversacion.fabricante_id !== userId
  ) {
    throw new ForbiddenError("No autorizado para ver esta conversación");
  }
}

export const chatService = {
  async listarMensajes(
    conversacionId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Mensaje>> {
    await assertParticipante(conversacionId, userId);

    const offset = (page - 1) * limit;
    const { rows, total } = await chatRepository.getMensajesPaginated(
      conversacionId,
      limit,
      offset,
    );
    // Abrir el historial equivale a leer la conversación.
    await chatRepository.marcarLeida(conversacionId, userId);

    return {
      data: rows.map(mapMensaje),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async listarConversaciones(userId: string): Promise<ConversacionResumen[]> {
    const rows = await chatRepository.getConversacionesByUsuario(userId);
    return rows.map((row: any) => mapConversacionResumen(row, userId));
  },

  async contarNoLeidos(userId: string): Promise<NoLeidosTotal> {
    return { total: await chatRepository.contarNoLeidosTotal(userId) };
  },

  async marcarLeida(
    conversacionId: string,
    userId: string,
  ): Promise<ConversacionLeida> {
    await assertParticipante(conversacionId, userId);
    await chatRepository.marcarLeida(conversacionId, userId);
    return { conversacionId, noLeidos: 0 };
  },
};
