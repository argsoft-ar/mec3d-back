export interface Conversacion {
  id: string;
  ordenFabricacionId: string;
  compradorId: string;
  fabricanteId: string;
  creadoEn: string;
}

export type TipoMensaje = "texto" | "sistema";

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
