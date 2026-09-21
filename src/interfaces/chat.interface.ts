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
  creadoEn: string;
}
