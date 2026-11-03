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
  creadoEn: string;
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
