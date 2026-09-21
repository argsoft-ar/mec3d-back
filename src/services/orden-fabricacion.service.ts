import crypto from "crypto";
import { ordenFabricacionRepository } from "../repositories/orden-fabricacion.repository";
import { compraRepository } from "../repositories/compra.repository";
import { chatRepository } from "../repositories/chat.repository";
import { mapMensaje } from "./chat.service";
import { userRepository } from "../repositories/user.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import { getProvinciaPrefix } from "../utils/zona.util";
import { getIO } from "../sockets/io.instance";
import {
  OrdenFabricacion,
  OrdenFabricacionCreada,
  OrdenFabricacionListItem,
  FabricanteSugerido,
  CodigoEntregaResponse,
} from "../interfaces/orden-fabricacion.interface";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  BadRequestError,
} from "../errors/app-error";

const ESTADOS_FINALES = [
  "trato_cerrado",
  "confirmada",
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
  ): Promise<OrdenFabricacionCreada[]> {
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

    // Regla de negocio: un fabricante no puede tener más de una orden/conversación
    // activa con el mismo comprador para el mismo diseño. Si ya existe, se reutiliza
    // en vez de crear una fila duplicada (evita error y mantiene el flujo fluido).
    const ordenes: any[] = [];
    for (const fabricanteId of fabricanteIds) {
      const existente =
        await ordenFabricacionRepository.getActivaPorCompradorYFabricante(
          compradorId,
          fabricanteId,
          compra.id_modelo,
        );
      ordenes.push(
        existente ??
          (await ordenFabricacionRepository.createOne(compraId, fabricanteId)),
      );
    }

    const conversacionIdPorOrdenId = new Map<string, string>();
    for (const orden of ordenes) {
      let conversacion = await chatRepository.getByOrdenFabricacionId(orden.id);
      if (!conversacion) {
        conversacion = await chatRepository.createConversacion({
          ordenFabricacionId: orden.id,
          compradorId,
          fabricanteId: orden.fabricante_id,
        });
      }
      conversacionIdPorOrdenId.set(orden.id, conversacion.id);
    }

    return ordenes.map((orden) => ({
      ...mapOrden(orden),
      conversacionId: conversacionIdPorOrdenId.get(orden.id)!,
    }));
  },

  async fabricantesSugeridos(disenoId: string): Promise<FabricanteSugerido[]> {
    const diseno = await disenoRepository.getByIdWithDesigner(disenoId);
    if (!diseno) {
      throw new NotFoundError("Diseño no encontrado");
    }

    const zonaId: number | null = diseno.designer_zona_id ?? null;
    const provinciaPrefix = zonaId !== null ? getProvinciaPrefix(zonaId) : null;

    // especificaciones es JSONB y pg ya lo parsea a objeto; se soporta string por si acaso.
    const especificaciones =
      typeof diseno.especificaciones === "string"
        ? JSON.parse(diseno.especificaciones)
        : diseno.especificaciones;
    const material: string | null = especificaciones?.material ?? null;

    const rows = await ordenFabricacionRepository.getFabricantesSugeridos(
      material,
      zonaId,
      provinciaPrefix,
    );

    return rows.map((row: any) => ({
      id: row.id,
      zonaId: row.zona_id,
      puntuacion: Number(row.puntuacion),
      tagline: row.tagline,
      username: row.username,
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

    // Bug conocido corregido: este endpoint es REST y antes no avisaba al otro
    // lado del chat, que solo veía la propuesta nueva al refrescar manualmente.
    const conversacion = await chatRepository.getByOrdenFabricacionId(ordenId);
    if (conversacion) {
      // Cartel embebido en el hilo del chat (no solo un estado aparte) para que
      // quede visible en el historial qué precio se propuso y quién lo hizo.
      const mensajePropuesta = await chatRepository.crearMensaje({
        conversacionId: conversacion.id,
        remitenteId: userId,
        contenido:
          role === "fabricante"
            ? `El fabricante propuso $${precio}`
            : `El comprador propuso $${precio}`,
        tipo: "propuesta_precio",
      });

      getIO()
        ?.to(conversacion.id)
        .emit("precio-propuesto", {
          ordenFabricacionId: ordenId,
          role,
          precio,
          orden: mapOrden(updated),
          mensaje: mapMensaje(mensajePropuesta),
        });
    }

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

    // Código de entrega de 6 dígitos (texto plano, ver nota en migrate.ts): el
    // comprador lo consulta cuantas veces quiera hasta que el fabricante lo cargue
    // al confirmar la entrega física.
    const codigoEntrega = crypto.randomInt(100000, 1000000).toString();
    await ordenFabricacionRepository.generarCodigoEntrega(
      ordenId,
      codigoEntrega,
    );

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
        mensaje: mapMensaje(mensajeSistema),
      });
    }

    return mapOrden(finalizada);
  },

  async getCodigoEntrega(
    ordenId: string,
    userId: string,
  ): Promise<CodigoEntregaResponse> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }
    // IDOR check: solo el comprador dueño de la orden puede ver el código de entrega.
    if (orden.id_comprador !== userId) {
      throw new ForbiddenError(
        "No autorizado para consultar el código de entrega",
      );
    }
    // Disponible desde que se cierra el trato hasta que el fabricante confirma la
    // entrega (incluye 'confirmada', el paso intermedio donde el comprador ya lo vio).
    if (orden.estado !== "trato_cerrado" && orden.estado !== "confirmada") {
      throw new ConflictError(
        "El código de entrega no está disponible en este estado",
      );
    }
    return { codigoEntrega: orden.codigo_entrega };
  },

  async declararEntrega(
    ordenId: string,
    userId: string,
  ): Promise<OrdenFabricacion> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }
    // IDOR check: solo el comprador dueño de la orden puede declarar la entrega.
    if (orden.id_comprador !== userId) {
      throw new ForbiddenError("No autorizado para confirmar esta entrega");
    }
    if (orden.estado !== "trato_cerrado") {
      throw new ConflictError(
        "La orden no está en condiciones de confirmar la entrega",
      );
    }

    const actualizada =
      await ordenFabricacionRepository.declararEntrega(ordenId);
    if (!actualizada) {
      throw new ConflictError("La entrega ya fue confirmada anteriormente");
    }

    const conversacion = await chatRepository.getByOrdenFabricacionId(ordenId);
    if (conversacion) {
      const mensajeSistema = await chatRepository.crearMensaje({
        conversacionId: conversacion.id,
        remitenteId: null,
        contenido:
          "El comprador confirmó la entrega, pendiente de validación del fabricante",
        tipo: "sistema",
      });
      getIO()
        ?.to(conversacion.id)
        .emit("entrega-declarada", {
          ordenFabricacionId: ordenId,
          mensaje: mapMensaje(mensajeSistema),
        });
    }

    return mapOrden(actualizada);
  },

  async confirmarEntrega(
    ordenId: string,
    codigo: string,
    userId: string,
  ): Promise<OrdenFabricacion> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }

    const role = resolveRole(orden, userId);
    if (role !== "fabricante") {
      throw new ForbiddenError("Solo el fabricante puede confirmar la entrega");
    }
    // El fabricante solo puede finalizar despues de que el comprador declare la
    // entrega ('confirmada'); antes de eso no hay nada que validar.
    if (orden.estado !== "confirmada") {
      throw new ConflictError(
        "La orden no está en condiciones de confirmar la entrega",
      );
    }

    // Comparación en tiempo constante, igual que compraService.confirmarEntrega,
    // para no filtrar por timing si el código coincide en longitud pero no en valor.
    const codigoBuffer = Buffer.from(codigo, "utf8");
    const storedBuffer = Buffer.from(orden.codigo_entrega ?? "", "utf8");
    const coincide =
      codigoBuffer.length === storedBuffer.length &&
      crypto.timingSafeEqual(codigoBuffer, storedBuffer);
    if (!coincide) {
      // 400, no 401: un código inválido es un error de validación del cliente, no una
      // falla de autenticación. Devolver 401 hacía que el front cerrara sesión sola.
      throw new BadRequestError("Código de entrega inválido");
    }

    const actualizada =
      await ordenFabricacionRepository.confirmarEntrega(ordenId);
    if (!actualizada) {
      throw new ConflictError("La entrega ya fue confirmada anteriormente");
    }

    const conversacion = await chatRepository.getByOrdenFabricacionId(ordenId);
    if (conversacion) {
      const mensajeSistema = await chatRepository.crearMensaje({
        conversacionId: conversacion.id,
        remitenteId: null,
        contenido: "Entrega confirmada por el fabricante",
        tipo: "sistema",
      });
      getIO()
        ?.to(conversacion.id)
        .emit("orden-completada", {
          ordenFabricacionId: ordenId,
          mensaje: mapMensaje(mensajeSistema),
        });
    }

    return mapOrden(actualizada);
  },

  async misSolicitudes(
    fabricanteId: string,
  ): Promise<OrdenFabricacionListItem[]> {
    const rows =
      await ordenFabricacionRepository.getMisSolicitudes(fabricanteId);
    return rows.map((row: any) => ({
      ...mapOrden(row),
      productoTitulo: row.producto_titulo,
      conversacionId: row.conversacion_id,
    }));
  },

  async getArchivoDescarga(ordenId: string, userId: string): Promise<string> {
    const row =
      await ordenFabricacionRepository.getArchivoParaDescarga(ordenId);
    if (!row) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }
    // IDOR check: solo el fabricante asignado a esta orden puede descargar el archivo.
    if (row.fabricante_id !== userId) {
      throw new ForbiddenError("No autorizado para descargar este archivo");
    }
    // Ventana de descarga: desde que se cierra el trato hasta que se confirma la
    // entrega (estado pasa a 'completado' y la solicitud se oculta para el fabricante).
    if (row.estado !== "trato_cerrado" && row.estado !== "confirmada") {
      throw new ConflictError(
        "El archivo solo está disponible mientras la orden está en curso",
      );
    }
    return row.archivo_url;
  },
};
