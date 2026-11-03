import { ordenFabricacionRepository } from "../repositories/orden-fabricacion.repository";
import { compraRepository } from "../repositories/compra.repository";
import { pagoRepository } from "../repositories/pago.repository";
import { chatRepository } from "../repositories/chat.repository";
import { mapMensaje } from "./chat.service";
import { userRepository } from "../repositories/user.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import { getProvinciaPrefix, refinarZonas } from "../utils/zona.util";
import { centavosAPesos, pesosACentavos } from "../utils/money.util";
import { withTransaction } from "../utils/transaction.util";
import { sanitizeForLog } from "../utils/log.util";
import {
  MAX_INTENTOS_CODIGO,
  generarCodigoEntrega,
  hashCodigoEntrega,
  verificarCodigoEntrega,
} from "../utils/delivery-code.util";
import { getDeliveryCodeSecret } from "../config/env.config";
import { getDeliveryTimeoutDays } from "../utils/policy.util";
import {
  esCategoriaPlano,
  MSG_PLANO_SIN_FABRICACION,
} from "../utils/plano.util";
import { catalogoService } from "./catalogo.service";
import { pagoService } from "./pago.service";
import { archivoService } from "./archivo.service";
import { solicitarPayouts } from "./payout.provider";
import { getIO } from "../sockets/io.instance";
import { notificarMensaje, notificarUsuario } from "../sockets/notificaciones";
import { aTextoPlano } from "../utils/texto.util";
import {
  MensajeCreadoRow,
  NuevaSolicitudFabricacion,
} from "../interfaces/chat.interface";
import {
  OrdenFabricacion,
  OrdenFabricacionCreada,
  OrdenFabricacionListItem,
  FabricanteSugerido,
  FiltroZonas,
  CodigoEntregaResponse,
  CancelarOrdenResultado,
  CerrarTratoResultado,
  OrdenDisenoResponse,
  OrdenCerradaFabricanteItem,
} from "../interfaces/orden-fabricacion.interface";
import {
  PaginatedResponse,
  PaginationParams,
} from "../interfaces/pagination.interface";
import { CompraRow, ResultadoReembolso } from "../interfaces/pago.interface";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  BadRequestError,
  TooManyRequestsError,
} from "../errors/app-error";

const ESTADOS_FINALES = [
  "trato_cerrado",
  "confirmada",
  "en_disputa",
  "cancelado",
  "rechazado",
  "completado",
];

type Rol = "comprador" | "fabricante";

// Estados con trato cerrado que el fabricante ve en su dashboard.
const ESTADOS_CERRADOS_FABRICANTE = [
  "trato_cerrado",
  "confirmada",
  "completado",
];

// Ventana de descarga del archivo: trato cerrado hasta confirmarse la entrega, con pago acreditado.
const ESTADOS_DESCARGA = ["trato_cerrado", "confirmada"];

function puedeDescargarArchivo(
  row: { fabricante_id: string; estado: string; compra_estado: string },
  userId: string,
): boolean {
  return (
    row.fabricante_id === userId &&
    ESTADOS_DESCARGA.includes(row.estado) &&
    row.compra_estado === "pagada"
  );
}

function resolveRole(orden: any, userId: string): Rol {
  if (orden.id_comprador === userId) return "comprador";
  if (orden.fabricante_id === userId) return "fabricante";
  throw new ForbiddenError(
    "No autorizado para operar sobre esta orden de fabricación",
  );
}

export function mapOrden(row: any): OrdenFabricacion {
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
    compraEstado: row.compra_estado ?? null,
    disputaMotivo: row.disputa_motivo ?? null,
    disputaAbiertaEn: row.disputa_abierta_en ?? null,
    disputaResolucion: row.disputa_resolucion ?? null,
  };
}

// La compra de fabricación es el ancla de las solicitudes: mientras se negocia está
// 'pendiente_pago' (el pago del precio final se habilita al cerrarse el trato).
function assertCompraAbiertaParaFabricacion(compra: CompraRow): void {
  if (compra.tipo !== "fabricacion") {
    throw new ConflictError("La compra no es de fabricación");
  }
  if (compra.estado !== "pendiente_pago") {
    throw new ConflictError(
      "La compra ya no admite nuevas solicitudes de fabricación",
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

// Notificación posterior al commit: un fallo del chat no debe hacer fallar una transición ya aplicada.
export async function emitirMensajeSistema(
  ordenId: string,
  contenido: string,
  evento: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const conversacion = await chatRepository.getByOrdenFabricacionId(ordenId);
    if (!conversacion) return;
    const mensajeSistema = await chatRepository.crearMensaje({
      conversacionId: conversacion.id,
      remitenteId: null,
      contenido,
      tipo: "sistema",
    });
    getIO()
      ?.to(conversacion.id)
      .emit(evento, {
        ordenFabricacionId: ordenId,
        ...extra,
        mensaje: mapMensaje(mensajeSistema),
      });
    notificarMensaje(mensajeSistema);
  } catch (error) {
    console.error(
      `❌ No se pudo notificar "${evento}" de la orden ${ordenId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

// Post-commit: avisa a cada fabricante con conversación nueva; un fallo acá no revierte las órdenes.
async function notificarSolicitudes(
  creadas: {
    orden: { id: string; fabricante_id: string };
    conversacionId: string;
    mensajeSolicitud: MensajeCreadoRow | null;
  }[],
  ctx: { disenoId: string; disenoTitulo: string; compradorId: string },
): Promise<void> {
  const nuevas = creadas.filter((c) => c.mensajeSolicitud !== null);
  if (nuevas.length === 0) return;
  try {
    const comprador = await userRepository.findById(ctx.compradorId);
    const compradorUsername: string | null = comprador?.username ?? null;
    for (const { orden, conversacionId, mensajeSolicitud } of nuevas) {
      const payload: NuevaSolicitudFabricacion = {
        ordenId: orden.id,
        conversacionId,
        disenoId: ctx.disenoId,
        disenoTitulo: ctx.disenoTitulo,
        compradorUsername,
      };
      notificarUsuario(
        orden.fabricante_id,
        "nueva-solicitud-fabricacion",
        payload,
      );
      if (mensajeSolicitud) {
        notificarMensaje(mensajeSolicitud, [ctx.compradorId]);
      }
    }
  } catch (error) {
    console.error(
      "❌ No se pudieron notificar las solicitudes de fabricación:",
      error instanceof Error ? error.message : error,
    );
  }
}

export const ordenFabricacionService = {
  async crear(
    compraId: string,
    fabricanteIdsSolicitados: string[],
    compradorId: string,
  ): Promise<OrdenFabricacionCreada[]> {
    // El schema ya colapsa duplicados; se repite acá por si otro caller llama al service.
    const fabricanteIds = [...new Set(fabricanteIdsSolicitados)];

    const compra = await compraRepository.getById(compraId);
    if (!compra) {
      throw new NotFoundError("Compra no encontrada");
    }
    if (compra.id_comprador !== compradorId) {
      throw new ForbiddenError(
        "No autorizado para solicitar fabricación de esta compra",
      );
    }
    assertCompraAbiertaParaFabricacion(compra);

    // Ninguna vía de fabricación admite planos técnicos (también cubre compras previas a que
    // el diseño pasara a esa categoría).
    const diseno = await disenoRepository.getById(compra.id_modelo);
    if (!diseno) {
      throw new NotFoundError("Diseño no encontrado");
    }
    if (esCategoriaPlano(diseno.categoria_nombre)) {
      throw new ValidationError(MSG_PLANO_SIN_FABRICACION);
    }

    if (fabricanteIds.includes(compradorId)) {
      throw new ValidationError(
        "No podés solicitarte la fabricación a vos mismo",
      );
    }

    // Se valida server-side (una sola query) que cada destinatario sea realmente un
    // fabricante: nunca se confía en un rol enviado por el cliente.
    const fabricantesValidos =
      await userRepository.findFabricanteIds(fabricanteIds);
    const noFabricantes = fabricanteIds.filter(
      (id) => !fabricantesValidos.includes(id),
    );
    if (noFabricantes.length > 0) {
      throw new ValidationError(
        `Los usuarios ${noFabricantes.join(", ")} no son fabricantes válidos`,
      );
    }

    // Compatibilidad: el fabricante debe tener la tecnología del diseño y poder fabricar
    // en el material elegido en la compra (o, si no se eligió, en alguno de los del diseño).
    const materialIds: number[] = compra.material_id
      ? [compra.material_id]
      : (await catalogoService.getMaterialesDeDiseno(diseno.id)).map(
          (m) => m.id,
        );
    const compatibles =
      await ordenFabricacionRepository.getIdsFabricantesCompatibles(
        fabricanteIds,
        diseno.tecnologia_id,
        materialIds,
      );
    const incompatibles = fabricanteIds.filter(
      (id) => !compatibles.includes(id),
    );
    if (incompatibles.length > 0) {
      throw new ValidationError(
        `Los fabricantes ${incompatibles.join(", ")} no son compatibles con la tecnología y el material del diseño`,
      );
    }

    // Todas las órdenes y conversaciones se crean en una transacción: o quedan todas o
    // ninguna. El lock de la compra serializa solicitudes concurrentes sobre la misma compra.
    // Regla de negocio: un fabricante no puede tener más de una orden/conversación activa
    // con el mismo comprador para la misma compra; si ya existe, se reutiliza.
    const disenoTitulo = aTextoPlano(String(diseno.titulo ?? ""), 200);
    const resultado = await withTransaction(async (client) => {
      const bloqueada = await compraRepository.lockById(client, compraId);
      if (!bloqueada) {
        throw new NotFoundError("Compra no encontrada");
      }
      assertCompraAbiertaParaFabricacion(bloqueada);

      const creadas: {
        orden: any;
        conversacionId: string;
        mensajeSolicitud: MensajeCreadoRow | null;
      }[] = [];
      for (const fabricanteId of fabricanteIds) {
        const orden =
          (await ordenFabricacionRepository.getActivaPorCompradorYFabricante(
            compradorId,
            fabricanteId,
            compra.id_modelo,
            compraId,
            client,
          )) ??
          (await ordenFabricacionRepository.createOne(
            compraId,
            fabricanteId,
            client,
          ));

        const existente = await chatRepository.getByOrdenFabricacionId(
          orden.id,
          client,
        );
        const conversacion =
          existente ??
          (await chatRepository.createConversacion(
            {
              ordenFabricacionId: orden.id,
              compradorId,
              fabricanteId: orden.fabricante_id,
            },
            client,
          ));

        // Solo en conversaciones nuevas: el aviso queda en el hilo y cuenta como no leído
        // para el fabricante; el comprador (quien lo originó) queda al día.
        let mensajeSolicitud: MensajeCreadoRow | null = null;
        if (!existente) {
          mensajeSolicitud = await chatRepository.crearMensaje(
            {
              conversacionId: conversacion.id,
              remitenteId: null,
              contenido: `Nueva solicitud de fabricación para «${disenoTitulo}»`,
              tipo: "sistema",
            },
            client,
          );
          await chatRepository.marcarLeida(
            conversacion.id,
            compradorId,
            client,
          );
        }
        creadas.push({
          orden,
          conversacionId: conversacion.id,
          mensajeSolicitud,
        });
      }
      return creadas;
    });

    await notificarSolicitudes(resultado, {
      disenoId: diseno.id,
      disenoTitulo,
      compradorId,
    });

    return resultado.map(({ orden, conversacionId }) => ({
      ...mapOrden(orden),
      conversacionId,
    }));
  },

  async fabricantesSugeridos(
    disenoId: string,
    compraId: string,
    compradorId: string,
    page: number,
    limit: number,
    material?: string,
    zonas: FiltroZonas = { provincias: [], departamentos: [], localidades: [] },
  ): Promise<FabricanteSugerido[]> {
    const compra = await compraRepository.getById(compraId);
    if (!compra) {
      throw new NotFoundError("Compra no encontrada");
    }
    if (compra.id_comprador !== compradorId) {
      throw new ForbiddenError("No autorizado para consultar esta compra");
    }
    if (compra.id_modelo !== disenoId) {
      throw new ValidationError("La compra no corresponde al diseño indicado");
    }
    assertCompraAbiertaParaFabricacion(compra);

    const diseno = await disenoRepository.getByIdWithDesigner(disenoId);
    if (!diseno) {
      throw new NotFoundError("Diseño no encontrado");
    }
    if (esCategoriaPlano(diseno.categoria_nombre)) {
      throw new ValidationError(MSG_PLANO_SIN_FABRICACION);
    }

    const zonaId: number | null = diseno.designer_zona_id ?? null;
    const provinciaPrefix = zonaId !== null ? getProvinciaPrefix(zonaId) : null;

    // Con material elegido (debe pertenecer al diseño) se filtra por ese; sin él, por
    // cualquiera de los materiales compatibles del diseño.
    const materialIds = material
      ? [
          (await catalogoService.resolverMaterialDeDiseno(disenoId, material))
            .id,
        ]
      : (await catalogoService.getMaterialesDeDiseno(disenoId)).map(
          (m) => m.id,
        );

    // Un nivel más específico reemplaza a su ancestro (ver refinarZonas); el resto va con OR.
    const refinadas = refinarZonas(zonas);
    const rows = await ordenFabricacionRepository.getFabricantesSugeridos(
      diseno.tecnologia_id,
      materialIds,
      zonaId,
      provinciaPrefix,
      compradorId,
      limit,
      (page - 1) * limit,
      {
        provincias: refinadas.provincias,
        departamentos: refinadas.departamentos,
        // zona_id guarda la localidad censal (8 dígitos): un id Georef de 11 también matchea por ella.
        localidadesCensales: [
          ...new Set(refinadas.localidades.map((l) => l.slice(0, 8))),
        ],
        localidadesGeoref: refinadas.localidades.filter((l) => l.length === 11),
      },
    );

    return rows.map((row: any) => ({
      id: row.id,
      zonaId: row.zona_id,
      georefLocalidadId: row.georef_localidad_id ?? null,
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

    const updated = await withTransaction(async (client) => {
      const bloqueada = await ordenFabricacionRepository.lockById(
        client,
        ordenId,
      );
      if (!bloqueada || ESTADOS_FINALES.includes(bloqueada.estado)) {
        throw new ConflictError(
          "Esta orden ya no admite nuevas propuestas de precio",
        );
      }
      const actualizada = await ordenFabricacionRepository.proponerPrecio(
        ordenId,
        role,
        precio,
        client,
      );
      if (!actualizada) {
        throw new ConflictError(
          "Esta orden ya no admite nuevas propuestas de precio",
        );
      }
      return actualizada;
    });

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
      notificarMensaje(mensajePropuesta);
    }

    return mapOrden(updated);
  },

  // Regla de negocio de cierre de trato: el fabricante solo PROPONE precio (proponerPrecio);
  // el comprador puede contraofertar, pero eso no cierra nada. Únicamente el comprador cierra
  // el trato aceptando el presupuesto vigente del fabricante, sin doble confirmación. `precio`
  // debe coincidir con esa propuesta para no aceptar un monto que el fabricante ya cambió.
  // En la misma transacción: se fija el monto de la compra (centavos), se cancelan las órdenes
  // hermanas y se genera el código de entrega. Tras el commit se crea la preference de pago
  // (initPoint); si falla, el comprador reintenta con POST /compras/:id/pagar.
  async cerrarTrato(
    ordenId: string,
    precio: number,
    userId: string,
  ): Promise<CerrarTratoResultado> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }

    if (resolveRole(orden, userId) !== "comprador") {
      throw new ForbiddenError(
        "Solo el comprador puede aceptar el presupuesto",
      );
    }
    const precioCentavos = pesosACentavos(precio);

    const finalizada = await withTransaction(async (client) => {
      // Orden de locks: compra -> orden.
      const compra = await compraRepository.lockById(client, orden.compra_id);
      const bloqueada = await ordenFabricacionRepository.lockById(
        client,
        ordenId,
      );
      if (!compra || !bloqueada) {
        throw new NotFoundError("Orden de fabricación no encontrada");
      }
      if (bloqueada.estado === "trato_cerrado") {
        throw new ConflictError("El trato para esta orden ya fue cerrado");
      }
      if (ESTADOS_FINALES.includes(bloqueada.estado)) {
        throw new ConflictError("Esta orden ya no admite cierre de trato");
      }
      if (compra.tipo !== "fabricacion" || compra.estado !== "pendiente_pago") {
        throw new ConflictError("La compra ya no admite el cierre de un trato");
      }
      // El diseño pudo pasar a "Planos técnicos" después de crearse la compra/orden.
      const disenoDeLaCompra = await disenoRepository.getById(compra.id_modelo);
      if (esCategoriaPlano(disenoDeLaCompra?.categoria_nombre)) {
        throw new ValidationError(MSG_PLANO_SIN_FABRICACION);
      }

      const presupuesto: string | number | null =
        bloqueada.precio_propuesto_fabricante ?? null;
      if (presupuesto === null) {
        throw new ConflictError(
          "El fabricante todavía no propuso un presupuesto",
          "SIN_PRESUPUESTO",
        );
      }
      if (pesosACentavos(presupuesto) !== precioCentavos) {
        throw new ConflictError(
          "El presupuesto del fabricante cambió: revisá el precio vigente antes de aceptarlo",
          "PRESUPUESTO_DESACTUALIZADO",
        );
      }

      let aceptada;
      try {
        aceptada = await ordenFabricacionRepository.aceptarPresupuesto(
          ordenId,
          presupuesto,
          client,
        );
      } catch (error) {
        // uq_orden_cerrada_por_compra: otra orden de la misma compra ya cerró.
        if (isUniqueViolation(error)) {
          throw new ConflictError("Esta compra ya tiene un trato cerrado");
        }
        throw error;
      }
      if (!aceptada) {
        throw new ConflictError("Esta orden ya no admite cierre de trato");
      }

      if (
        !(await compraRepository.setMontoFabricacion(
          client,
          compra.id,
          precioCentavos,
        ))
      ) {
        throw new ConflictError("No se pudo fijar el monto de la compra");
      }
      await ordenFabricacionRepository.cancelarHermanas(
        compra.id,
        ordenId,
        client,
      );

      // Código de entrega de 6 dígitos: solo se persiste su HMAC. El comprador recibe un
      // código nuevo cada vez que lo consulta (ver getCodigoEntrega), que invalida el anterior.
      const codigoHash = hashCodigoEntrega(
        ordenId,
        generarCodigoEntrega(),
        getDeliveryCodeSecret(),
      );
      const conCodigo = await ordenFabricacionRepository.guardarCodigoEntrega(
        ordenId,
        codigoHash,
        client,
      );
      if (!conCodigo) {
        throw new ConflictError("El trato para esta orden ya no está vigente");
      }

      return aceptada;
    });

    const precioAcordado = centavosAPesos(precioCentavos);
    await emitirMensajeSistema(
      ordenId,
      `El comprador aceptó el presupuesto: trato cerrado por $${precioAcordado}`,
      "deal-closed",
      { precioAcordado, pagoRequerido: true },
    );

    let initPoint: string | null = null;
    try {
      initPoint = (await pagoService.iniciarPago(orden.compra_id, userId))
        .initPoint;
    } catch (error) {
      // El trato ya está cerrado: el comprador reintenta con POST /compras/:id/pagar.
      console.error(
        `❌ No se pudo crear la preference de la orden ${ordenId}:`,
        error instanceof Error ? error.message : error,
      );
    }

    return {
      orden: mapOrden({ ...finalizada, compra_estado: "pendiente_pago" }),
      pagoRequerido: true,
      initPoint,
    };
  },

  // Como solo se guarda el HMAC, el código no es recuperable: cada consulta del comprador
  // genera uno nuevo (invalida el anterior y reinicia el contador de intentos fallidos).
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
    // Sin pago acreditado no hay fondos retenidos que proteger: el código espera al pago.
    if (orden.compra_estado !== "pagada") {
      throw new ConflictError("El pago de la orden todavía no fue acreditado");
    }
    const codigoEntrega = generarCodigoEntrega();
    const guardado = await ordenFabricacionRepository.guardarCodigoEntrega(
      ordenId,
      hashCodigoEntrega(ordenId, codigoEntrega, getDeliveryCodeSecret()),
    );
    if (!guardado) {
      throw new ConflictError(
        "El código de entrega no está disponible en este estado",
      );
    }
    return { codigoEntrega };
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

    const actualizada = await withTransaction(async (client) => {
      const compra = await compraRepository.lockById(client, orden.compra_id);
      const bloqueada = await ordenFabricacionRepository.lockById(
        client,
        ordenId,
      );
      if (!compra || !bloqueada || bloqueada.estado !== "trato_cerrado") {
        throw new ConflictError(
          "La orden no está en condiciones de confirmar la entrega",
        );
      }
      if (compra.estado !== "pagada") {
        throw new ConflictError(
          "El pago de la orden todavía no fue acreditado",
        );
      }
      const declarada = await ordenFabricacionRepository.declararEntrega(
        ordenId,
        client,
      );
      if (!declarada) {
        throw new ConflictError("La entrega ya fue confirmada anteriormente");
      }
      return declarada;
    });

    await emitirMensajeSistema(
      ordenId,
      "El comprador confirmó la entrega, pendiente de validación del fabricante",
      "entrega-declarada",
    );

    return mapOrden({ ...actualizada, compra_estado: "pagada" });
  },

  // Doble confirmación completa: en UNA transacción (locks compra -> orden -> pago ->
  // movimientos) la orden pasa a 'completado', la compra a 'completada' y los fondos
  // retenidos a 'pendiente_payout' con el split. Si algo falla no cambia nada.
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

    const secret = getDeliveryCodeSecret();
    // Cada intento se reserva de forma atómica antes de comparar: tras MAX_INTENTOS_CODIGO
    // fallos la orden queda bloqueada hasta que el comprador pida un código nuevo.
    const intentos = await ordenFabricacionRepository.reservarIntentoCodigo(
      ordenId,
      MAX_INTENTOS_CODIGO,
    );
    if (intentos === null) {
      const actual = await ordenFabricacionRepository.getById(ordenId);
      if (actual?.estado !== "confirmada") {
        throw new ConflictError(
          "La orden no está en condiciones de confirmar la entrega",
        );
      }
      console.warn(
        `🔒 Intento de confirmar entrega sobre orden bloqueada ${sanitizeForLog(ordenId)} (fabricante ${sanitizeForLog(userId)})`,
      );
      throw new TooManyRequestsError(
        "Se superó el máximo de intentos. Pedile al comprador que genere un código nuevo",
      );
    }

    const coincide = verificarCodigoEntrega(
      ordenId,
      codigo,
      orden.codigo_entrega_hash,
      secret,
    );
    if (!coincide) {
      if (intentos >= MAX_INTENTOS_CODIGO) {
        console.warn(
          `🔒 Orden ${sanitizeForLog(ordenId)} bloqueada tras ${intentos} intentos fallidos de código (fabricante ${sanitizeForLog(userId)})`,
        );
        throw new TooManyRequestsError(
          "Se superó el máximo de intentos. Pedile al comprador que genere un código nuevo",
        );
      }
      // 400, no 401: un código inválido es un error de validación del cliente, no una
      // falla de autenticación. Devolver 401 hacía que el front cerrara sesión sola.
      throw new BadRequestError(
        `Código de entrega inválido. Intentos restantes: ${MAX_INTENTOS_CODIGO - intentos}`,
      );
    }

    const { actualizada, liberados } = await withTransaction(async (client) => {
      const compra = await compraRepository.lockById(client, orden.compra_id);
      const bloqueada = await ordenFabricacionRepository.lockById(
        client,
        ordenId,
      );
      if (!compra || !bloqueada || bloqueada.estado !== "confirmada") {
        throw new ConflictError(
          "La orden no está en condiciones de confirmar la entrega",
        );
      }
      if (compra.estado !== "pagada") {
        throw new ConflictError(
          "El pago de la orden todavía no fue acreditado",
        );
      }

      const completada = await ordenFabricacionRepository.confirmarEntrega(
        ordenId,
        client,
      );
      if (!completada) {
        throw new ConflictError("La entrega ya fue confirmada anteriormente");
      }
      if (
        !(await compraRepository.completar(client, compra.id, {
          entrega: true,
        }))
      ) {
        throw new ConflictError("La compra ya fue completada");
      }
      const movimientos = await pagoService.liberarRetenidos(client, compra.id);
      return { actualizada: completada, liberados: movimientos };
    });

    await emitirMensajeSistema(
      ordenId,
      "Entrega confirmada por el fabricante",
      "orden-completada",
    );
    await solicitarPayouts(liberados);

    return mapOrden({ ...actualizada, compra_estado: "completada" });
  },

  // Cancelación antes del cierre (solicitado / en_negociacion / trato_cerrado, nunca tras
  // declararse la entrega ni en disputa). Con la compra ya pagada el comprador NO cancela
  // unilateralmente (los fondos están retenidos a favor del fabricante): debe disputar. Solo
  // el fabricante (reembolso al comprador) o un admin pueden cancelar. Con el trato cerrado la
  // compra queda cancelada y, si ya estaba paga, se reembolsa: la intención de reembolso se
  // persiste en la misma transacción y la llamada a MP es reintentable (scheduler / admin).
  async cancelar(
    ordenId: string,
    userId: string,
  ): Promise<CancelarOrdenResultado> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }
    const usuario = await userRepository.findById(userId);
    const esAdmin = usuario?.rol_principal === "admin";
    const role: Rol | "admin" = esAdmin ? "admin" : resolveRole(orden, userId);

    const { cancelada, pagoId, estadoPrevio } = await withTransaction(
      async (client) => {
        const compra = await compraRepository.lockById(client, orden.compra_id);
        const bloqueada = await ordenFabricacionRepository.lockById(
          client,
          ordenId,
        );
        if (!compra || !bloqueada) {
          throw new NotFoundError("Orden de fabricación no encontrada");
        }
        const previo: string = bloqueada.estado;
        if (previo === "en_disputa") {
          throw new ConflictError(
            "La orden está en disputa: solo un administrador puede resolverla",
          );
        }
        if (role === "comprador" && compra.estado === "pagada") {
          throw new ForbiddenError(
            "Con el pago acreditado no podés cancelar la orden: si hay un problema, abrí una disputa",
          );
        }
        const cancelada = await ordenFabricacionRepository.cancelar(
          client,
          ordenId,
        );
        if (!cancelada) {
          throw new ConflictError("La orden ya no puede cancelarse");
        }

        let pagoId: string | null = null;
        if (previo === "trato_cerrado") {
          // Sin la orden ganadora la compra de fabricación no tiene continuidad.
          const pago = await pagoRepository.lockAprobadoPrincipalPorCompra(
            client,
            compra.id,
          );
          if (!(await compraRepository.cancelar(client, compra.id))) {
            throw new ConflictError("La compra ya no puede cancelarse");
          }
          if (pago) {
            await pagoRepository.marcarReembolsoPendiente(
              client,
              pago.id,
              "cancelacion_orden",
            );
            pagoId = pago.id;
          }
        }
        return { cancelada, pagoId, estadoPrevio: previo };
      },
    );

    let reembolso: ResultadoReembolso = "no_aplica";
    if (pagoId) {
      try {
        reembolso = await pagoService.reembolsar(pagoId, "cancelacion_orden");
      } catch (error) {
        console.error(
          `❌ Reembolso de la orden ${ordenId} quedó pendiente:`,
          error instanceof Error ? error.message : error,
        );
        reembolso = "pendiente";
      }
    }

    await emitirMensajeSistema(
      ordenId,
      role === "comprador"
        ? "El comprador canceló la orden"
        : role === "fabricante"
          ? "El fabricante canceló la orden"
          : "Un administrador canceló la orden",
      "orden-cancelada",
    );

    return {
      orden: mapOrden({
        ...cancelada,
        compra_estado: estadoPrevio === "trato_cerrado" ? "cancelada" : null,
      }),
      reembolso,
    };
  },

  // Órdenes 'confirmada' sin completar pasado DELIVERY_TIMEOUT_DAYS: solo se marcan para
  // revisión de un admin. Nunca liberan fondos por sí solas.
  async marcarEntregasVencidas(): Promise<number> {
    const ids = await ordenFabricacionRepository.marcarEntregasVencidas(
      getDeliveryTimeoutDays(),
    );
    if (ids.length > 0) {
      console.warn(
        `⚠️  ${ids.length} orden(es) con entrega vencida marcadas para revisión admin: ${ids.join(", ")}`,
      );
    }
    return ids.length;
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
    if (!ESTADOS_DESCARGA.includes(row.estado)) {
      throw new ConflictError(
        "El archivo solo está disponible mientras la orden está en curso",
      );
    }
    // El fabricante recibe el archivo recién con el pago del comprador acreditado.
    if (row.compra_estado !== "pagada") {
      throw new ConflictError("El pago de la orden todavía no fue acreditado");
    }
    return (await archivoService.firmarUrl(row.archivo_url)).url;
  },

  // Specs del diseño para los participantes de la orden (mismo control que el resto del
  // router: 404 si no existe, 403 si no participa). Nunca expone archivoUrl; puedeDescargar
  // replica las reglas de GET /:id/descargar-diseno.
  async getDiseno(
    ordenId: string,
    userId: string,
  ): Promise<OrdenDisenoResponse> {
    const row = await ordenFabricacionRepository.getDisenoDeOrden(ordenId);
    if (!row) {
      throw new NotFoundError("Orden de fabricación no encontrada");
    }
    resolveRole(row, userId);

    const esPlano = esCategoriaPlano(row.categoria_nombre);
    return {
      ordenId: row.orden_id,
      estado: row.estado,
      material: row.material_nombre ?? null,
      diseno: {
        id: row.diseno_id,
        titulo: row.titulo,
        descripcion: row.descripcion ?? null,
        imagenUrl: row.imagen_url ?? null,
        // Ruta del preview degradado público; nunca la key de R2.
        previewUrl:
          row.tiene_preview && !esPlano
            ? `/api/v1/productos/${row.diseno_id}/preview-publico`
            : null,
        categoria: row.categoria_nombre ?? null,
        tecnologia: row.tecnologia_nombre ?? null,
        materiales: row.materiales_nombres ?? [],
        formato: row.formato ?? null,
        pesoGramos: row.peso_gramos ?? null,
        especificaciones: row.especificaciones ?? null,
      },
      puedeDescargar: puedeDescargarArchivo(row, userId),
    };
  },

  // El rol se relee de la DB (como requireAdmin): un JWT viejo no concede acceso.
  async cerradasFabricante(
    userId: string,
    { page, limit }: PaginationParams,
  ): Promise<PaginatedResponse<OrdenCerradaFabricanteItem>> {
    const usuario = await userRepository.findById(userId);
    if (usuario?.rol_principal !== "fabricante") {
      throw new ForbiddenError(
        "Solo los fabricantes pueden ver sus órdenes cerradas",
      );
    }
    const { rows, total } =
      await ordenFabricacionRepository.getCerradasPorFabricante(
        userId,
        ESTADOS_CERRADOS_FABRICANTE,
        limit,
        (page - 1) * limit,
      );
    return {
      data: rows.map((row: any) => ({
        id: row.id,
        compraId: row.compra_id,
        estado: row.estado,
        disenoId: row.diseno_id,
        disenoTitulo: row.diseno_titulo,
        disenoImagenUrl: row.diseno_imagen_url ?? null,
        compradorUsername: row.comprador_username ?? null,
        precioAcordado:
          row.precio_acordado !== null ? Number(row.precio_acordado) : null,
        material: row.material_nombre ?? null,
        fechaCierre: row.cerrado_en ?? null,
        actualizadoEn: row.actualizado_en ?? null,
        conversacionId: row.conversacion_id ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
};
