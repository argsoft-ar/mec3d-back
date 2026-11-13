import { compraRepository } from "../repositories/compra.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import { ordenFabricacionRepository } from "../repositories/orden-fabricacion.repository";
import { pagoRepository } from "../repositories/pago.repository";
import {
  CancelarCompraResultado,
  Compra,
  CrearCompraResultado,
  EstadoCompraDescarga,
  MisComprasItem,
} from "../interfaces/compra.interface";
import { CompraRow, TipoCompra } from "../interfaces/pago.interface";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors/app-error";
import {
  centavosAPesos,
  pesosACentavos,
  toCentavos,
} from "../utils/money.util";
import { Db, withTransaction } from "../utils/transaction.util";
import {
  esCategoriaPlano,
  MSG_PLANO_SIN_FABRICACION,
} from "../utils/plano.util";
import { catalogoService } from "./catalogo.service";
import { pagoService } from "./pago.service";
import { archivoService } from "./archivo.service";
import { emitirMensajeSistema } from "./orden-fabricacion.service";

type CompraConMaterial = Partial<CompraRow> &
  Pick<CompraRow, "id" | "id_comprador" | "id_modelo" | "id_disenador"> & {
    material_nombre?: string | null;
  };

export const CODIGO_COMPRA_DUPLICADA = "COMPRA_DUPLICADA";
const MSG_COMPRA_DUPLICADA = "Ya compraste este diseño";
export const CODIGO_COMPRA_NO_CANCELABLE = "COMPRA_NO_CANCELABLE";

function esCompraCobrada(estado: CompraRow["estado"] | undefined): boolean {
  return estado === "pagada" || estado === "completada";
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

function mapCompra(row: CompraConMaterial): Compra {
  const monto =
    row.monto_centavos === null || row.monto_centavos === undefined
      ? null
      : toCentavos(row.monto_centavos);
  return {
    id: row.id,
    idComprador: row.id_comprador,
    idModelo: row.id_modelo,
    idDisenador: row.id_disenador,
    tipo: row.tipo as TipoCompra,
    estado: row.estado as Compra["estado"],
    montoCentavos: monto,
    moneda: row.moneda ?? "ARS",
    precioPagado: monto === null ? null : centavosAPesos(monto),
    fecha: row.fecha as string,
    pagadaEn: row.pagada_en ?? null,
    entregaConfirmada: row.entrega_confirmada ?? false,
    entregadoEn: row.entregado_en ?? null,
    fondosLiberados: row.fondos_liberados ?? false,
    fondosLiberadosEn: row.fondos_liberados_en ?? null,
    material: row.material_nombre ?? null,
  };
}

// Campos del diseño que usa la creación de compras (los repositorios devuelven la fila sin tipar).
interface DisenoParaCompra {
  id: string;
  disenador_id: string;
  precio_base: number | string;
  categoria_nombre: string | null;
  eliminado_en: Date | string | null;
}

// La fabricación bloquea la fila del diseño (ver crear); la descarga solo lo lee.
async function obtenerDisenoParaCompra(
  client: Db,
  tipo: TipoCompra,
  disenoId: string,
  compradorId: string,
): Promise<DisenoParaCompra> {
  const diseno: DisenoParaCompra | null =
    tipo === "fabricacion"
      ? await disenoRepository.lockById(client, disenoId)
      : await disenoRepository.getById(disenoId, client);
  if (!diseno || diseno.eliminado_en) {
    throw new NotFoundError("Diseño no encontrado");
  }

  if (tipo === "descarga" && diseno.disenador_id === compradorId) {
    throw new ConflictError("No podés comprar tu propio diseño");
  }
  return diseno;
}

// Descarga activa del comprador sobre el diseño: 409 si ya está cobrada; si está pendiente se
// reutiliza (con el monto al precio actual). null si no hay ninguna.
async function resolverDescargaExistente(
  client: Db,
  compradorId: string,
  diseno: DisenoParaCompra,
): Promise<CompraRow | null> {
  await compraRepository.lockCompraDescarga(client, compradorId, diseno.id);
  const existente = await compraRepository.getCompraDescargaExistente(
    compradorId,
    diseno.id,
    client,
  );
  if (!existente) return null;
  if (esCompraCobrada(existente.estado)) {
    throw new ConflictError(MSG_COMPRA_DUPLICADA, CODIGO_COMPRA_DUPLICADA);
  }
  // El precio lo fija el diseño actual, no el de cuando se creó la pendiente.
  const montoActual = pesosACentavos(diseno.precio_base);
  if (
    existente.monto_centavos === null ||
    toCentavos(existente.monto_centavos) !== montoActual
  ) {
    const actualizada = await compraRepository.setMontoDescargaPendiente(
      client,
      existente.id,
      montoActual,
    );
    if (!actualizada) {
      throw new ConflictError("La compra no está pendiente de pago");
    }
    return actualizada;
  }
  return existente;
}

function mapearErrorCreacion(tipo: TipoCompra, error: unknown): never {
  // Respaldo de uq_compra_descarga_activa si el lock no lo cubrió.
  if (tipo === "descarga" && isUniqueViolation(error)) {
    throw new ConflictError(MSG_COMPRA_DUPLICADA, CODIGO_COMPRA_DUPLICADA);
  }
  throw error;
}

export const compraService = {
  // descarga: crea la compra 'pendiente_pago' y la preference de Checkout Pro; si ya hay una
  // descarga pendiente del mismo comprador y diseño la reutiliza, y si ya está cobrada responde 409.
  // fabricacion: solo crea el ancla; el pago se inicia al cerrarse el trato
  // (POST /compras/:id/pagar) con el precio final negociado.
  async crear(
    disenoId: string,
    compradorId: string,
    tipo: TipoCompra,
    materialNombre?: string,
  ): Promise<CrearCompraResultado> {
    // La fabricación bloquea la fila del diseño hasta el INSERT: serializa contra el cambio de
    // categoría a "Planos técnicos" (productService), que toma el mismo lock.
    const { compra, materialElegido } = await withTransaction(
      async (client) => {
        const diseno = await obtenerDisenoParaCompra(
          client,
          tipo,
          disenoId,
          compradorId,
        );

        if (tipo === "descarga") {
          const existente = await resolverDescargaExistente(
            client,
            compradorId,
            diseno,
          );
          if (existente) {
            return { compra: existente, materialElegido: null };
          }
        }

        if (
          tipo === "fabricacion" &&
          esCategoriaPlano(diseno.categoria_nombre)
        ) {
          throw new ValidationError(MSG_PLANO_SIN_FABRICACION);
        }
        // El material, si se indica, debe ser uno de los materiales del diseño.
        const material = materialNombre
          ? await catalogoService.resolverMaterialDeDiseno(
              diseno.id,
              materialNombre,
            )
          : null;

        const creada = await compraRepository
          .create(
            {
              idComprador: compradorId,
              idModelo: diseno.id,
              idDisenador: diseno.disenador_id,
              tipo,
              montoCentavos:
                tipo === "descarga" ? pesosACentavos(diseno.precio_base) : null,
              materialId: material?.id ?? null,
            },
            client,
          )
          .catch((error: unknown) => mapearErrorCreacion(tipo, error));
        return { compra: creada, materialElegido: material };
      },
    );
    const mapped = mapCompra({
      ...compra,
      material_nombre: materialElegido?.nombre,
    });

    if (tipo === "fabricacion") {
      return { compra: mapped, initPoint: null };
    }
    // Compra nueva o pendiente reutilizada: el monto ya quedó al precio actual dentro de la
    // transacción anterior, así que se inicia el pago directamente.
    const { initPoint } = await pagoService.iniciarPago(compra.id, compradorId);
    return { compra: mapped, initPoint };
  },

  // Estado de la descarga del comprador sobre un diseño (solo compras activas).
  async estadoDescarga(
    disenoId: string,
    compradorId: string,
  ): Promise<EstadoCompraDescarga> {
    const compra = await compraRepository.getCompraDescargaExistente(
      compradorId,
      disenoId,
    );
    return {
      comprado: esCompraCobrada(compra?.estado),
      compraId: compra?.id ?? null,
      estado: compra?.estado ?? null,
    };
  },

  // Reintento de pago (preference vencida o abandonada) de una compra 'pendiente_pago'.
  // En descargas el monto se re-fija al precio ACTUAL del diseño (igual que en crear) y se
  // exige que el diseño siga publicado: sin esto, una compra pendiente creada a un precio viejo
  // permitía pagar ese monto (o comprar un diseño ya dado de baja) vía este endpoint.
  async pagar(compraId: string, compradorId: string) {
    await withTransaction(async (client) => {
      const compra = await compraRepository.lockById(client, compraId);
      if (!compra) {
        throw new NotFoundError("Compra no encontrada");
      }
      if (compra.id_comprador !== compradorId) {
        throw new ForbiddenError("No autorizado para pagar esta compra");
      }
      if (compra.tipo !== "descarga" || compra.estado !== "pendiente_pago") {
        return; // fabricación (monto = trato) y estados no pagables: los valida iniciarPago
      }
      const diseno = await disenoRepository.getById(compra.id_modelo, client);
      if (!diseno || diseno.eliminado_en) {
        throw new NotFoundError("Diseño no encontrado");
      }
      const montoActual = pesosACentavos(diseno.precio_base);
      if (
        compra.monto_centavos === null ||
        toCentavos(compra.monto_centavos) !== montoActual
      ) {
        const actualizada = await compraRepository.setMontoDescargaPendiente(
          client,
          compra.id,
          montoActual,
        );
        if (!actualizada) {
          throw new ConflictError("La compra no está pendiente de pago");
        }
      }
    });
    return pagoService.iniciarPago(compraId, compradorId);
  },

  // El comprador abandona una compra sin pagar. Locks compra -> órdenes -> pagos. Los intentos
  // pendientes quedan rechazados: un cobro tardío de MP se reembolsa ('compra_cancelada').
  async cancelar(
    compraId: string,
    compradorId: string,
  ): Promise<CancelarCompraResultado> {
    const cancelada = await withTransaction(async (client) => {
      const compra = await compraRepository.lockById(client, compraId);
      if (!compra) {
        throw new NotFoundError("Compra no encontrada");
      }
      if (compra.id_comprador !== compradorId) {
        throw new ForbiddenError("No autorizado para cancelar esta compra");
      }
      if (compra.estado !== "pendiente_pago") {
        throw new ConflictError(
          "La compra ya no puede cancelarse",
          CODIGO_COMPRA_NO_CANCELABLE,
        );
      }

      const ordenes =
        compra.tipo === "fabricacion"
          ? await ordenFabricacionRepository.cancelarAbiertasPorCompra(
              client,
              compra.id,
            )
          : [];

      const pagos = await pagoRepository.lockPorCompra(client, compra.id);
      if (pagos.some((p) => p.estado === "aprobado")) {
        throw new ConflictError(
          "La compra tiene un pago acreditado y no puede cancelarse",
          CODIGO_COMPRA_NO_CANCELABLE,
        );
      }
      await pagoRepository.rechazarPendientesPorCompra(client, compra.id);

      if (!(await compraRepository.cancelar(client, compra.id))) {
        throw new ConflictError(
          "La compra ya no puede cancelarse",
          CODIGO_COMPRA_NO_CANCELABLE,
        );
      }
      return {
        ordenesCanceladas: ordenes,
        preferenceIds: pagos
          .map((p) => p.mp_preference_id)
          .filter((id): id is string => !!id),
      };
    });
    const { ordenesCanceladas, preferenceIds } = cancelada;

    try {
      await pagoService.expirarPreferences(preferenceIds);
    } catch (error) {
      console.error(
        `❌ No se pudieron expirar las preferences de la compra ${compraId}:`,
        error instanceof Error ? error.message : error,
      );
    }

    // emitirMensajeSistema usa el pool (no un cliente compartido) y nunca rechaza: en paralelo.
    await Promise.all(
      ordenesCanceladas.map((orden) =>
        emitirMensajeSistema(
          orden.id,
          "El comprador canceló la solicitud de fabricación",
          "orden-cancelada",
        ),
      ),
    );

    return { compraId, estado: "cancelada" };
  },

  async misCompras(compradorId: string): Promise<MisComprasItem[]> {
    const rows = await compraRepository.getMisCompras(compradorId);
    return rows.map((row) => ({
      ...mapCompra(row),
      ordenFabricacionId: row.orden_fabricacion_id ?? null,
      ordenFabricacionEstado: row.orden_fabricacion_estado ?? null,
      diseno: {
        titulo: row.diseno_titulo,
        imagenUrl: row.diseno_imagen_url,
        formato: row.diseno_formato,
      },
    }));
  },

  async getArchivoDescarga(compraId: string, userId: string): Promise<string> {
    const row = await compraRepository.getArchivoParaDescarga(compraId);
    if (!row) {
      throw new NotFoundError("Compra no encontrada");
    }
    // IDOR check: solo el comprador dueño de la compra puede descargar el archivo.
    if (row.id_comprador !== userId) {
      throw new ForbiddenError("No autorizado para descargar este archivo");
    }
    // El archivo digital solo se entrega con el pago acreditado; la compra de fabricación
    // no incluye el archivo (lo recibe el fabricante).
    if (row.tipo !== "descarga") {
      throw new ForbiddenError(
        "Esta compra no incluye la descarga del archivo",
      );
    }
    if (row.estado !== "pagada" && row.estado !== "completada") {
      throw new ConflictError(
        "El pago de esta compra todavía no fue acreditado",
      );
    }
    // Redirige a una URL firmada de 5 min (R2) o a un host de la allowlist (legacy).
    return (await archivoService.firmarUrl(row.archivo_url, { adjunto: true }))
      .url;
  },
};
