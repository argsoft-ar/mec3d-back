import pool from "../config/db.config";
import { CompraRow, TipoCompra } from "../interfaces/pago.interface";
import { Db } from "../utils/transaction.util";

const COLUMNAS = `id, id_comprador, id_modelo, id_disenador, material_id, tipo, estado,
  monto_centavos, moneda, fecha, pagada_en, cancelada_en, entrega_confirmada,
  entregado_en, fondos_liberados, fondos_liberados_en`;

export const compraRepository = {
  async create(
    data: {
      idComprador: string;
      idModelo: string;
      idDisenador: string;
      tipo: TipoCompra;
      montoCentavos: number | null;
      materialId?: number | null;
    },
    db: Db = pool,
  ): Promise<CompraRow> {
    const result = await db.query<CompraRow>(
      `INSERT INTO compras (id_comprador, id_modelo, id_disenador, tipo, monto_centavos, material_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNAS};`,
      [
        data.idComprador,
        data.idModelo,
        data.idDisenador,
        data.tipo,
        data.montoCentavos,
        data.materialId ?? null,
      ],
    );
    return result.rows[0];
  },

  async getById(id: string, db: Db = pool): Promise<CompraRow | null> {
    const result = await db.query<CompraRow>(
      `SELECT ${COLUMNAS} FROM compras WHERE id = $1;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  // Primer lock de la jerarquía compra -> orden -> pago -> movimientos: toda transición
  // que toque más de una de esas tablas debe tomarlos en ese orden.
  async lockById(client: Db, id: string): Promise<CompraRow | null> {
    const result = await client.query<CompraRow>(
      `SELECT ${COLUMNAS} FROM compras WHERE id = $1 FOR UPDATE;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async getMisCompras(compradorId: string) {
    const query = `
      SELECT
        c.id, c.id_comprador, c.id_modelo, c.id_disenador, c.tipo, c.estado,
        c.monto_centavos, c.moneda, c.fecha, c.pagada_en, c.material_id,
        c.entrega_confirmada, c.entregado_en, c.fondos_liberados, c.fondos_liberados_en,
        d.titulo AS diseno_titulo, d.imagen_url AS diseno_imagen_url,
        d.formato AS diseno_formato,
        m.nombre AS material_nombre,
        orden.id AS orden_fabricacion_id, orden.estado AS orden_fabricacion_estado
      FROM compras c
      JOIN disenos d ON d.id = c.id_modelo
      LEFT JOIN materiales m ON m.id = c.material_id
      LEFT JOIN LATERAL (
        SELECT id, estado FROM ordenes_fabricacion
        WHERE compra_id = c.id AND estado IN ('trato_cerrado', 'confirmada', 'en_disputa', 'completado')
        ORDER BY creado_en DESC
        LIMIT 1
      ) orden ON true
      WHERE c.id_comprador = $1
      ORDER BY c.fecha DESC;
    `;
    const result = await pool.query(query, [compradorId]);
    return result.rows;
  },

  // El archivo debe seguir siendo descargable por el comprador aunque el diseño haya
  // sido soft-deleteado (una compra ya pagada no puede perder el acceso), por eso esta
  // consulta NO filtra por disenos.eliminado_en.
  async getArchivoParaDescarga(compraId: string) {
    const result = await pool.query<{
      id_comprador: string;
      tipo: TipoCompra;
      estado: CompraRow["estado"];
      archivo_url: string;
    }>(
      `SELECT c.id_comprador, c.tipo, c.estado, d.archivo_url
       FROM compras c
       JOIN disenos d ON d.id = c.id_modelo
       WHERE c.id = $1;`,
      [compraId],
    );
    return result.rows[0] ?? null;
  },

  // Fija el monto de una compra de fabricación al cerrarse el trato.
  async setMontoFabricacion(
    db: Db,
    id: string,
    montoCentavos: number,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE compras SET monto_centavos = $2
       WHERE id = $1 AND tipo = 'fabricacion' AND estado = 'pendiente_pago';`,
      [id, montoCentavos],
    );
    return result.rowCount === 1;
  },

  async marcarPagada(db: Db, id: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE compras SET estado = 'pagada', pagada_en = now()
       WHERE id = $1 AND estado = 'pendiente_pago';`,
      [id],
    );
    return result.rowCount === 1;
  },

  // pagada -> completada con los fondos liberados (descarga directa o doble confirmación).
  async completar(
    db: Db,
    id: string,
    opts: { entrega: boolean },
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE compras
       SET estado = 'completada',
           fondos_liberados = true, fondos_liberados_en = now(),
           entrega_confirmada = entrega_confirmada OR $2,
           entregado_en = CASE WHEN $2 THEN now() ELSE entregado_en END
       WHERE id = $1 AND estado = 'pagada';`,
      [id, opts.entrega],
    );
    return result.rowCount === 1;
  },

  // Con un pago aprobado, 'cancelada' equivale a "reembolso pendiente" (ver pagos).
  async cancelar(db: Db, id: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE compras SET estado = 'cancelada', cancelada_en = now()
       WHERE id = $1 AND estado IN ('pendiente_pago', 'pagada');`,
      [id],
    );
    return result.rowCount === 1;
  },

  async marcarReembolsada(db: Db, id: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE compras SET estado = 'reembolsada'
       WHERE id = $1 AND estado IN ('pagada', 'completada', 'cancelada');`,
      [id],
    );
    return result.rowCount === 1;
  },
};
