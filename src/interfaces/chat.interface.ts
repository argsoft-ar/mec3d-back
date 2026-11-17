export interface Conversacion {
  id: string;
  ordenFabricacionId: string;
  compradorId: string;
  fabricanteId: string;
  creadoEn: string;
}

export type TipoMensaje = "texto" | "sistema" | "propuesta_precio";

export interface Mensaje {
  id: string;
  conversacionId: string;
  remitenteId: string | null;
  contenido: string;
  tipo: TipoMensaje;
  creadoEn: string;
}

export interface EnviarMensajeDTO {
  conversacionId: string;
  contenido: string;
}

export interface ConversacionResumen {
  id: string;
  ordenFabricacionId: string;
  productoTitulo: string | null;
  miRol: "comprador" | "fabricante";
  contraparte: {
    id: string;
    username: string | null;
    tagline: string | null;
  };
  estadoOrden: string;
  precioAcordado: number | null;
  precioPropuestoComprador: number | null;
  precioPropuestoFabricante: number | null;
  ultimoMensaje: { contenido: string; creadoEn: string } | null;
  noLeidos: number;
  // true si la contraparte cerró el chat: el front deshabilita el envío de mensajes.
  cerradaPorContraparte: boolean;
  creadoEn: string;
}

export type RolConversacion = "comprador" | "fabricante";

// Fila de conversaciones (snake_case) tal como la devuelve el repositorio.
export interface ConversacionRow {
  id: string;
  orden_fabricacion_id: string;
  comprador_id: string;
  fabricante_id: string;
  creado_en: string;
  cerrada_por_comprador_en: string | null;
  cerrada_por_fabricante_en: string | null;
}

// Conversación + estado de su orden (chequeo de envío de mensajes).
export interface ConversacionConOrdenRow extends ConversacionRow {
  orden_estado: string;
}

// Respuesta de POST /conversaciones/:id/cerrar.
export interface CerrarConversacionResultado {
  conversacionId: string;
  ordenEstado: string;
}

// Evento socket "conversacion-cerrada" (room user:<contraparteId>).
export interface ConversacionCerradaEvento {
  conversacionId: string;
  ordenFabricacionId: string;
  ordenEstado: string;
  cerradaPor: RolConversacion;
}

// Fila devuelta por chatRepository.crearMensaje: mensaje + participantes para notificar.
export interface MensajeCreadoRow {
  id: string;
  conversacion_id: string;
  remitente_id: string | null;
  contenido: string;
  tipo: TipoMensaje;
  creado_en: string;
  comprador_id?: string;
  fabricante_id?: string;
  // Estado de cierre al momento del alta: el notificador omite a quien cerró.
  cerrada_por_comprador_en?: string | null;
  cerrada_por_fabricante_en?: string | null;
  remitente_username?: string | null;
}

// Evento socket "notificacion-mensaje" (room user:<id>).
export interface NotificacionMensaje {
  conversacionId: string;
  mensajeId: string;
  remitenteUsername: string | null;
  preview: string;
  tipo: TipoMensaje;
  creadoEn: string;
}

// Evento socket "nueva-solicitud-fabricacion" (room user:<fabricanteId>).
export interface NuevaSolicitudFabricacion {
  ordenId: string;
  conversacionId: string;
  disenoId: string;
  disenoTitulo: string;
  compradorUsername: string | null;
}

export interface NoLeidosTotal {
  total: number;
}

export interface ConversacionLeida {
  conversacionId: string;
  noLeidos: 0;
}
