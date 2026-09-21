import { compraRepository } from "../repositories/compra.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import { Compra, MisComprasItem } from "../interfaces/compra.interface";
import { NotFoundError, ForbiddenError } from "../errors/app-error";

function mapCompra(row: any): Compra {
  return {
    id: row.id,
    idComprador: row.id_comprador,
    idModelo: row.id_modelo,
    idDisenador: row.id_disenador,
    precioPagado: Number(row.precio_pagado),
    fecha: row.fecha,
    entregaConfirmada: row.entrega_confirmada,
    entregadoEn: row.entregado_en,
    fondosLiberados: row.fondos_liberados,
    fondosLiberadosEn: row.fondos_liberados_en,
  };
}

export const compraService = {
  async crear(disenoId: string, compradorId: string): Promise<Compra> {
    const diseno = await disenoRepository.getById(disenoId);
    if (!diseno || diseno.eliminado_en) {
      throw new NotFoundError("Diseño no encontrado");
    }

    const compra = await compraRepository.create({
      idComprador: compradorId,
      idModelo: diseno.id,
      idDisenador: diseno.disenador_id,
      precioPagado: Number(diseno.precio_base),
    });

    return mapCompra(compra);
  },

  async misCompras(compradorId: string): Promise<MisComprasItem[]> {
    const rows = await compraRepository.getMisCompras(compradorId);
    return rows.map((row: any) => ({
      ...mapCompra(row),
      ordenFabricacionId: row.orden_fabricacion_id ?? null,
      ordenFabricacionEstado: row.orden_fabricacion_estado ?? null,
      diseno: {
        titulo: row.diseno_titulo,
        imagenUrl: row.diseno_imagen_url,
        formato: row.diseno_formato,
        archivoUrl: row.diseno_archivo_url,
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
    return row.archivo_url;
  },
};
