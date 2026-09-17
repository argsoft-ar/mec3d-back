import crypto from "crypto";
import { compraRepository } from "../repositories/compra.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import { Compra, MisComprasItem } from "../interfaces/compra.interface";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  UnauthorizedError,
} from "../errors/app-error";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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
  async crear(
    disenoId: string,
    compradorId: string,
  ): Promise<{ compra: Compra; tokenVerificacion: string }> {
    const diseno = await disenoRepository.getById(disenoId);
    if (!diseno || diseno.eliminado_en) {
      throw new NotFoundError("Diseño no encontrado");
    }

    // Token de entrega/escrow: se genera server-side con 32 bytes de entropía,
    // solo se persiste su hash SHA-256 y el valor en claro se devuelve una única
    // vez en la respuesta de creación (nunca se loguea ni se vuelve a exponer).
    const tokenPlano = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(tokenPlano);

    const compra = await compraRepository.create({
      idComprador: compradorId,
      idModelo: diseno.id,
      idDisenador: diseno.disenador_id,
      precioPagado: Number(diseno.precio_base),
      tokenVerificacionHash: tokenHash,
    });

    return { compra: mapCompra(compra), tokenVerificacion: tokenPlano };
  },

  async misCompras(compradorId: string): Promise<MisComprasItem[]> {
    const rows = await compraRepository.getMisCompras(compradorId);
    return rows.map((row: any) => ({
      ...mapCompra(row),
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

  async confirmarEntrega(
    compraId: string,
    tokenPlano: string,
    userId: string,
  ): Promise<Compra> {
    const compra = await compraRepository.getById(compraId);
    if (!compra) {
      throw new NotFoundError("Compra no encontrada");
    }

    // IDOR check: solo el comprador dueño de la compra puede confirmar la entrega.
    // Se verifica antes de revelar entrega_confirmada para no filtrar ese estado
    // a terceros no autorizados que solo adivinaron el id de la compra.
    if (compra.id_comprador !== userId) {
      throw new ForbiddenError("No autorizado para confirmar esta entrega");
    }

    if (compra.entrega_confirmada) {
      throw new ConflictError("La entrega ya fue confirmada anteriormente");
    }

    const tokenHashBuffer = Buffer.from(hashToken(tokenPlano), "utf8");
    const storedHashBuffer = Buffer.from(
      compra.token_verificacion_hash,
      "utf8",
    );

    // Comparación en tiempo constante: evita timing attacks al validar el hash del
    // token. La respuesta nunca distingue si falló por longitud o por contenido.
    const coincide =
      tokenHashBuffer.length === storedHashBuffer.length &&
      crypto.timingSafeEqual(tokenHashBuffer, storedHashBuffer);

    if (!coincide) {
      throw new UnauthorizedError("Token de verificación inválido");
    }

    const actualizado = await compraRepository.confirmarEntrega(compraId);
    return mapCompra({ ...compra, ...actualizado });
  },
};
