import { ordenFabricacionRepository } from "../repositories/orden-fabricacion.repository";
import { compraRepository } from "../repositories/compra.repository";
import { chatRepository } from "../repositories/chat.repository";
import { userRepository } from "../repositories/user.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import { getProvinciaPrefix } from "../utils/zona.util";
import { getIO } from "../sockets/io.instance";
import {
  OrdenFabricacion,
  FabricanteSugerido,
} from "../interfaces/orden-fabricacion.interface";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../errors/app-error";

const ESTADOS_FINALES = [
  "trato_cerrado",
  "cancelado",
  "rechazado",
  "completado",
];

type Rol = "comprador" | "fabricante";

function resolveRole(orden: any, userId: string): Rol {
  if (orden.id_comprador === userId) return "comprador";
  if (orden.fabricante_id === userId) return "fabricante";
  throw new ForbiddenError(
    "No autorizado para operar sobre esta orden de fabricación",
  );
}

function mapOrden(row: any): OrdenFabricacion {
  return {
    id: row.id,
    compraId: row.compra_id,
    fabricanteId: row.fabricante_id,
    estado: row.estado,
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
    cerradoPorComprador: row.cerrado_por_comprador,
    cerradoPorFabricante: row.cerrado_por_fabricante,
    cerradoEn: row.cerrado_en,
    creadoEn: row.creado_en,
  };
}

export const ordenFabricacionService = {
  async crear(
    compraId: string,
    fabricanteIds: string[],
    compradorId: string,
  ): Promise<OrdenFabricacion[]> {
    const compra = await compraRepository.getById(compraId);
    if (!compra) {
      throw new NotFoundError("Compra no encontrada");
    }
    if (compra.id_comprador !== compradorId) {
      throw new ForbiddenError(
        "No autorizado para solicitar fabricación de esta compra",
      );
    }

    // Se valida server-side que cada destinatario sea realmente un fabricante:
    // nunca se confía en un rol enviado por el cliente.
    for (const fabricanteId of fabricanteIds) {
      const fabricante = await userRepository.findById(fabricanteId);
      if (!fabricante || fabricante.rol_principal !== "fabricante") {
        throw new ValidationError(
          `El usuario ${fabricanteId} no es un fabricante válido`,
        );
      }
    }

    const ordenes = await ordenFabricacionRepository.createMany(
      compraId,
      fabricanteIds,
    );

    for (const orden of ordenes) {
      await chatRepository.createConversacion({
        ordenFabricacionId: orden.id,
        compradorId,
        fabricanteId: orden.fabricante_id,
      });
    }

    return ordenes.map(mapOrden);
  },

  async fabricantesSugeridos(disenoId: string): Promise<FabricanteSugerido[]> {
    const diseno = await disenoRepository.getByIdWithDesigner(disenoId);
    if (!diseno) {
      throw new NotFoundError("Diseño no encontrado");
    }

    const zonaId: number | null = diseno.designer_zona_id ?? null;
    const provinciaPrefix = zonaId !== null ? getProvinciaPrefix(zonaId) : null;

    const rows = await ordenFabricacionRepository.getFabricantesSugeridos(
      diseno.formato ?? null,
      zonaId,
      provinciaPrefix,
    );

    return rows.map((row: any) => ({
      id: row.id,
      zonaId: row.zona_id,
      puntuacion: Number(row.puntuacion),
      tagline: row.tagline,
    }));
  },

  async proponerPrecio(
    ordenId: string,
    precio: number,
    userId: string,
  ): Promise<OrdenFabricacion> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }

    const role = resolveRole(orden, userId);

    if (ESTADOS_FINALES.includes(orden.estado)) {
      throw new ConflictError(
        "Esta orden ya no admite nuevas propuestas de precio",
      );
    }

    const updated = await ordenFabricacionRepository.proponerPrecio(
      ordenId,
      role,
      precio,
    );
    return mapOrden(updated);
  },

  // Regla de negocio de cierre de trato (documentada acá porque no es evidente
  // desde el código): cada llamada a este endpoint pisa el precio propuesto de
  // quien la invoca y marca su flag de cierre en true. El trato solo se finaliza
  // cuando AMBAS partes tienen su flag de cierre en true Y el precio que cada una
  // confirmó coincide; si la otra parte todavía no cerró, o cerró con otro monto,
  // la orden queda "en_negociacion" esperando acuerdo.
  async cerrarTrato(
    ordenId: string,
    precio: number,
    userId: string,
  ): Promise<OrdenFabricacion> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }

    const role = resolveRole(orden, userId);

    if (orden.estado === "trato_cerrado") {
      throw new ConflictError("El trato para esta orden ya fue cerrado");
    }
    if (ESTADOS_FINALES.includes(orden.estado)) {
      throw new ConflictError("Esta orden ya no admite cierre de trato");
    }

    const marcada = await ordenFabricacionRepository.marcarCierre(
      ordenId,
      role,
      precio,
    );

    const otroLadoConfirmo =
      role === "comprador"
        ? marcada.cerrado_por_fabricante
        : marcada.cerrado_por_comprador;
    const otroPrecio =
      role === "comprador"
        ? marcada.precio_propuesto_fabricante
        : marcada.precio_propuesto_comprador;

    if (
      !otroLadoConfirmo ||
      otroPrecio === null ||
      Number(otroPrecio) !== precio
    ) {
      return mapOrden(marcada);
    }

    const finalizada = await ordenFabricacionRepository.finalizarTrato(
      ordenId,
      precio,
    );

    // finalizarTrato no afecto ninguna fila: otra peticion concurrente ya cerro el
    // trato primero. No se repiten los efectos secundarios (mensaje/emit/cancelacion).
    if (!finalizada) {
      return mapOrden(marcada);
    }

    await ordenFabricacionRepository.cancelarHermanas(orden.compra_id, ordenId);

    const conversacion = await chatRepository.getByOrdenFabricacionId(ordenId);
    if (conversacion) {
      const mensajeSistema = await chatRepository.crearMensaje({
        conversacionId: conversacion.id,
        remitenteId: null,
        contenido: `Trato cerrado por $${precio}`,
        tipo: "sistema",
      });

      const io = getIO();
      io?.to(conversacion.id).emit("deal-closed", {
        ordenFabricacionId: ordenId,
        precioAcordado: precio,
        mensaje: mensajeSistema,
      });
    }

    return mapOrden(finalizada);
  },
};
