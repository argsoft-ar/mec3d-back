import { compraRepository } from "../repositories/compra.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import {
  Compra,
  CrearCompraResultado,
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
import { withTransaction } from "../utils/transaction.util";
import {
  esCategoriaPlano,
  MSG_PLANO_SIN_FABRICACION,
} from "../utils/plano.util";
import { catalogoService } from "./catalogo.service";
import { pagoService } from "./pago.service";
import { archivoService } from "./archivo.service";

type CompraConMaterial = Partial<CompraRow> &
  Pick<CompraRow, "id" | "id_comprador" | "id_modelo" | "id_disenador"> & {
    material_nombre?: string | null;
  };

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

export const compraService = {
  // descarga: crea la compra 'pendiente_pago' y la preference de Checkout Pro.
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
        const diseno =
          tipo === "fabricacion"
            ? await disenoRepository.lockById(client, disenoId)
            : await disenoRepository.getById(disenoId, client);
        if (!diseno || diseno.eliminado_en) {
          throw new NotFoundError("Diseño no encontrado");
        }

        if (tipo === "descarga" && diseno.disenador_id === compradorId) {
          throw new ConflictError("No podés comprar tu propio diseño");
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

        const creada = await compraRepository.create(
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
        );
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
    const { initPoint } = await pagoService.iniciarPago(compra.id, compradorId);
    return { compra: mapped, initPoint };
  },

  // Reintento de pago (preference vencida o abandonada) de una compra 'pendiente_pago'.
  async pagar(compraId: string, compradorId: string) {
    return pagoService.iniciarPago(compraId, compradorId);
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
