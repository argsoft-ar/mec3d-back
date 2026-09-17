import pool from "../config/db.config";

export const compraRepository = {
  async create(data: {
    idComprador: string;
    idModelo: string;
    idDisenador: string;
    precioPagado: number;
    tokenVerificacionHash: string;
  }) {
    const query = `
      INSERT INTO compras (id_comprador, id_modelo, id_disenador, precio_pagado, token_verificacion_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, id_comprador, id_modelo, id_disenador, precio_pagado, fecha,
                entrega_confirmada, entregado_en, fondos_liberados, fondos_liberados_en;
    `;
    const values = [
      data.idComprador,
      data.idModelo,
      data.idDisenador,
      data.precioPagado,
      data.tokenVerificacionHash,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async getById(id: string) {
    const query = `SELECT * FROM compras WHERE id = $1;`;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  },

  async getMisCompras(compradorId: string) {
    const query = `
      SELECT
        c.id, c.id_modelo, c.id_disenador, c.precio_pagado, c.fecha,
        c.entrega_confirmada, c.entregado_en, c.fondos_liberados, c.fondos_liberados_en,
        d.titulo AS diseno_titulo, d.imagen_url AS diseno_imagen_url,
        d.formato AS diseno_formato, d.archivo_url AS diseno_archivo_url
      FROM compras c
      JOIN disenos d ON d.id = c.id_modelo
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
    const query = `
      SELECT c.id_comprador, d.archivo_url
      FROM compras c
      JOIN disenos d ON d.id = c.id_modelo
      WHERE c.id = $1;
    `;
    const result = await pool.query(query, [compraId]);
    return result.rows[0] ?? null;
  },

  async confirmarEntrega(id: string) {
    const query = `
      UPDATE compras
      SET entrega_confirmada = true, entregado_en = now(),
          fondos_liberados = true, fondos_liberados_en = now()
      WHERE id = $1
      RETURNING id, entrega_confirmada, entregado_en, fondos_liberados, fondos_liberados_en;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  },
};
