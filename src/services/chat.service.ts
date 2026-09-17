import { chatRepository } from "../repositories/chat.repository";
import { ForbiddenError, NotFoundError } from "../errors/app-error";
import { PaginatedResponse } from "../interfaces/pagination.interface";
import { Mensaje } from "../interfaces/chat.interface";

function mapMensaje(row: any): Mensaje {
  return {
    id: row.id,
    conversacionId: row.conversacion_id,
    remitenteId: row.remitente_id,
    contenido: row.contenido,
    tipo: row.tipo,
    creadoEn: row.creado_en,
  };
}

export const chatService = {
  async listarMensajes(
    conversacionId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Mensaje>> {
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

    const offset = (page - 1) * limit;
    const { rows, total } = await chatRepository.getMensajesPaginated(
      conversacionId,
      limit,
      offset,
    );

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
};
