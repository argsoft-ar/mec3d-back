import { chatRepository } from "../repositories/chat.repository";
import { ordenFabricacionRepository } from "../repositories/orden-fabricacion.repository";
import { compraRepository } from "../repositories/compra.repository";
import { withTransaction } from "../utils/transaction.util";
import { getIO } from "../sockets/io.instance";
import {
  notificarMensaje,
  notificarUsuario,
  sacarUsuarioDeSala,
} from "../sockets/notificaciones";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../errors/app-error";
import { PaginatedResponse } from "../interfaces/pagination.interface";
import {
  Mensaje,
  ConversacionResumen,
  ConversacionLeida,
  NoLeidosTotal,
  CerrarConversacionResultado,
  ConversacionCerradaEvento,
  ConversacionRow,
  MensajeCreadoRow,
  RolConversacion,
} from "../interfaces/chat.interface";

// Cierre de chat: con el trato cerrado y la entrega sin concretar, o en disputa, la
// conversación es el canal de la operación en curso y no puede abandonarse.
const MSG_CIERRE_TRATO_EN_CURSO =
  "No podés cerrar el chat: el trato está cerrado y la entrega todavía no se concretó";
const ESTADOS_CIERRE_BLOQUEADO: Record<string, string> = {
  trato_cerrado: MSG_CIERRE_TRATO_EN_CURSO,
  confirmada: MSG_CIERRE_TRATO_EN_CURSO,
  en_disputa:
    "No podés cerrar el chat mientras la orden está en disputa: un administrador debe resolverla",
};
// Cerrar durante la negociación cancela (comprador) o rechaza (fabricante) la solicitud.
const ESTADOS_NEGOCIACION = new Set<string>(["solicitado", "en_negociacion"]);
// Orden ya terminada: cerrar solo oculta la conversación para quien la cierra.
const ESTADOS_SOLO_OCULTAR = new Set<string>([
  "completado",
  "cancelado",
  "rechazado",
]);
// Una orden cancelada/rechazada no admite más mensajes en su conversación.
const ESTADOS_SIN_MENSAJES = new Set<string>(["cancelado", "rechazado"]);

type Participantes = Pick<
  ConversacionRow,
  "comprador_id" | "fabricante_id"
> &
  Partial<
    Pick<ConversacionRow, "cerrada_por_comprador_en" | "cerrada_por_fabricante_en">
  >;

function rolEnConversacion(
  conversacion: Participantes,
  userId: string,
): RolConversacion | null {
  if (conversacion.comprador_id === userId) return "comprador";
  if (conversacion.fabricante_id === userId) return "fabricante";
  return null;
}

function cerradaPorRol(
  conversacion: Participantes,
  rol: RolConversacion,
): boolean {
  const cerradaEn =
    rol === "comprador"
      ? conversacion.cerrada_por_comprador_en
      : conversacion.cerrada_por_fabricante_en;
  return cerradaEn !== null && cerradaEn !== undefined;
}

const contraparteDe = (rol: RolConversacion): RolConversacion =>
  rol === "comprador" ? "fabricante" : "comprador";

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
    cerradaPorContraparte: cerradaPorRol(row, contraparteDe(miRol)),
    creadoEn: row.creado_en,
  };
}

// 404 si no existe, 403 si no participa. No filtra por cierre (ver assertParticipante).
async function obtenerParticipacion(
  conversacionId: string,
  userId: string,
): Promise<{ conversacion: ConversacionRow; rol: RolConversacion }> {
  const conversacion: ConversacionRow | null =
    await chatRepository.getById(conversacionId);
  if (!conversacion) {
    throw new NotFoundError("Conversación no encontrada");
  }
  const rol = rolEnConversacion(conversacion, userId);
  if (!rol) {
    throw new ForbiddenError("No autorizado para ver esta conversación");
  }
  return { conversacion, rol };
}

// Una conversación que el usuario cerró deja de existir para él (404).
async function assertParticipante(
  conversacionId: string,
  userId: string,
): Promise<void> {
  const { conversacion, rol } = await obtenerParticipacion(
    conversacionId,
    userId,
  );
  if (cerradaPorRol(conversacion, rol)) {
    throw new NotFoundError("Conversación no encontrada");
  }
}

// Post-commit: un fallo de socket no revierte un cierre ya aplicado.
function notificarCierre(params: {
  conversacion: ConversacionRow;
  rol: RolConversacion;
  userId: string;
  ordenEstado: string;
  mensaje: MensajeCreadoRow | null;
}): void {
  const { conversacion, rol, userId, ordenEstado, mensaje } = params;
  try {
    if (mensaje) {
      // Mismo evento y forma que emitirMensajeSistema para cancelaciones: el front ya
      // refresca el estado de la orden con "orden-cancelada".
      getIO()
        ?.to(conversacion.id)
        .emit("orden-cancelada", {
          ordenFabricacionId: conversacion.orden_fabricacion_id,
          estado: ordenEstado,
          cerradaPor: rol,
          mensaje: mapMensaje(mensaje),
        });
      notificarMensaje(mensaje, [userId]);
    }

    const contraparteId =
      rol === "comprador" ? conversacion.fabricante_id : conversacion.comprador_id;
    const evento: ConversacionCerradaEvento = {
      conversacionId: conversacion.id,
      ordenFabricacionId: conversacion.orden_fabricacion_id,
      ordenEstado,
      cerradaPor: rol,
    };
    notificarUsuario(contraparteId, "conversacion-cerrada", evento);
    // Quien cerró deja de recibir eventos de la room (ya no la ve).
    sacarUsuarioDeSala(userId, conversacion.id);
  } catch (error) {
    console.error(
      `❌ No se pudo notificar el cierre de la conversación ${conversacion.id}:`,
      error instanceof Error ? error.message : error,
    );
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

  // Socket "join-conversacion": participante que no cerró la conversación.
  async puedeUnirse(conversacionId: string, userId: string): Promise<boolean> {
    const conversacion = await chatRepository.getConOrden(conversacionId);
    if (!conversacion) return false;
    const rol = rolEnConversacion(conversacion, userId);
    return rol !== null && !cerradaPorRol(conversacion, rol);
  },

  // Envío de mensajes: participante, ninguna de las partes cerró y la orden sigue viva.
  async assertPuedeEnviar(
    conversacionId: string,
    userId: string,
  ): Promise<void> {
    const conversacion = await chatRepository.getConOrden(conversacionId);
    if (!conversacion) {
      throw new NotFoundError("Conversación no encontrada");
    }
    const rol = rolEnConversacion(conversacion, userId);
    if (!rol) {
      throw new ForbiddenError("No autorizado para esta conversación");
    }
    if (cerradaPorRol(conversacion, rol)) {
      throw new NotFoundError("Conversación no encontrada");
    }
    if (cerradaPorRol(conversacion, contraparteDe(rol))) {
      throw new ConflictError(
        "La otra parte cerró esta conversación: ya no admite mensajes",
        "CONVERSACION_CERRADA",
      );
    }
    if (ESTADOS_SIN_MENSAJES.has(conversacion.orden_estado)) {
      throw new ConflictError(
        "La orden fue cancelada o rechazada: la conversación ya no admite mensajes",
        "CONVERSACION_CERRADA",
      );
    }
  },

  // Cierre por participante (soft). Durante la negociación cancela (comprador) o rechaza
  // (fabricante) la orden en la misma transacción y deja un mensaje de sistema; con la orden
  // ya terminada solo la oculta. Bloqueado con trato en curso o en disputa. Idempotente.
  async cerrarConversacion(
    conversacionId: string,
    userId: string,
  ): Promise<CerrarConversacionResultado> {
    const { conversacion, rol } = await obtenerParticipacion(
      conversacionId,
      userId,
    );

    const orden = await ordenFabricacionRepository.getById(
      conversacion.orden_fabricacion_id,
    );
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }
    // El cierre nunca se revierte: repetirlo devuelve el estado actual sin efectos.
    if (cerradaPorRol(conversacion, rol)) {
      return { conversacionId, ordenEstado: orden.estado };
    }

    const resultado = await withTransaction(async (client) => {
      // Jerarquía de locks: compra -> orden -> conversación (igual que cancelar/proponer precio).
      await compraRepository.lockById(client, orden.compra_id);
      const bloqueada = await ordenFabricacionRepository.lockById(
        client,
        orden.id,
      );
      if (!bloqueada) {
        throw new NotFoundError("Orden de fabricación no encontrada");
      }
      // FOR UPDATE de la conversación: un envío que ya tomó FOR SHARE termina antes; uno
      // posterior espera al commit y ve la conversación cerrada (no inserta).
      const convBloqueada = await chatRepository.lockById(
        client,
        conversacionId,
      );
      if (!convBloqueada) {
        throw new NotFoundError("Conversación no encontrada");
      }
      const estado: string = bloqueada.estado;
      // Cierre concurrente del mismo participante: idempotente, sin efectos.
      if (cerradaPorRol(convBloqueada, rol)) {
        return { ordenEstado: estado, mensaje: null, yaCerrada: true };
      }
      const bloqueo = ESTADOS_CIERRE_BLOQUEADO[estado];
      if (bloqueo) {
        throw new ConflictError(bloqueo, "CHAT_NO_CERRABLE");
      }

      let ordenEstado = estado;
      let mensaje: MensajeCreadoRow | null = null;
      if (ESTADOS_NEGOCIACION.has(estado)) {
        const actualizada = await ordenFabricacionRepository.cerrarPorChat(
          client,
          orden.id,
          rol === "comprador" ? "cancelado" : "rechazado",
        );
        if (!actualizada) {
          throw new ConflictError(
            "La orden cambió de estado: volvé a intentarlo",
          );
        }
        ordenEstado = actualizada.estado;
        mensaje = await chatRepository.crearMensaje(
          {
            conversacionId,
            remitenteId: null,
            contenido:
              rol === "comprador"
                ? "El comprador cerró el chat y canceló la solicitud. Podés eliminar esta conversación."
                : "El fabricante cerró el chat y rechazó la solicitud. Podés eliminar esta conversación.",
            tipo: "sistema",
          },
          client,
        );
      } else if (!ESTADOS_SOLO_OCULTAR.has(estado)) {
        throw new ConflictError(
          "La conversación no puede cerrarse en el estado actual de la orden",
          "CHAT_NO_CERRABLE",
        );
      }

      await chatRepository.cerrarParaUsuario(client, conversacionId, rol);
      return { ordenEstado, mensaje, yaCerrada: false };
    });

    const { ordenEstado, mensaje, yaCerrada } = resultado;
    if (!yaCerrada) {
      notificarCierre({ conversacion, rol, userId, ordenEstado, mensaje });
    }
    return { conversacionId, ordenEstado };
  },
};
