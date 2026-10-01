import pool from "../config/db.config";

export const ordenFabricacionRepository = {
  async createMany(compraId: string, fabricanteIds: string[]) {
    const placeholders = fabricanteIds
      .map((_, i) => `($1, $${i + 2})`)
      .join(", ");
    const query = `
      INSERT INTO ordenes_fabricacion (compra_id, fabricante_id)
      VALUES ${placeholders}
      RETURNING id, compra_id, fabricante_id, estado, precio_acordado,
                precio_propuesto_comprador, precio_propuesto_fabricante,
                cerrado_por_comprador, cerrado_por_fabricante, cerrado_en, creado_en;
    `;
    const result = await pool.query(query, [compraId, ...fabricanteIds]);
    return result.rows;
  },

  // Se trae id_comprador de la compra asociada para poder resolver el rol del
  // solicitante (comprador o fabricante) sin un join extra en cada consumidor.
  async getById(id: string) {
    const query = `
      SELECT o.*, c.id_comprador
      FROM ordenes_fabricacion o
      JOIN compras c ON c.id = o.compra_id
      WHERE o.id = $1;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  },

  async proponerPrecio(
    id: string,
    role: "comprador" | "fabricante",
    precio: number,
  ) {
    const columnaPrecio =
      role === "comprador"
        ? "precio_propuesto_comprador"
        : "precio_propuesto_fabricante";
    const columnaCerrado =
      role === "comprador" ? "cerrado_por_comprador" : "cerrado_por_fabricante";
    // Proponer un precio nuevo invalida la confirmación de cierre previa de esa parte:
    // evita cerrar el trato con un monto viejo si el usuario cambió su propuesta.
    const query = `
      UPDATE ordenes_fabricacion
      SET ${columnaPrecio} = $1, ${columnaCerrado} = false,
          estado = CASE WHEN estado = 'solicitado' THEN 'en_negociacion' ELSE estado END
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [precio, id]);
    return result.rows[0] ?? null;
  },

  async marcarCierre(
    id: string,
    role: "comprador" | "fabricante",
    precio: number,
  ) {
    const columnaPrecio =
      role === "comprador"
        ? "precio_propuesto_comprador"
        : "precio_propuesto_fabricante";
    const columnaCerrado =
      role === "comprador" ? "cerrado_por_comprador" : "cerrado_por_fabricante";
    const query = `
      UPDATE ordenes_fabricacion
      SET ${columnaPrecio} = $1, ${columnaCerrado} = true,
          estado = CASE WHEN estado = 'solicitado' THEN 'en_negociacion' ELSE estado END
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [precio, id]);
    return result.rows[0] ?? null;
  },

  // Guard atomico (WHERE estado != 'trato_cerrado'): si dos peticiones concurrentes
  // llegan a cerrar el mismo trato, solo la primera actualiza la fila; la segunda
  // recibe 0 filas afectadas en vez de re-finalizar y duplicar efectos secundarios.
  async finalizarTrato(id: string, precioAcordado: number) {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'trato_cerrado', precio_acordado = $1, cerrado_en = now()
      WHERE id = $2 AND estado != 'trato_cerrado'
      RETURNING *;
    `;
    const result = await pool.query(query, [precioAcordado, id]);
    return result.rows[0] ?? null;
  },

  // El comprador eligió un fabricante: las demás órdenes abiertas de la misma compra se cancelan.
  async cancelarHermanas(compraId: string, ordenGanadoraId: string) {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'cancelado'
      WHERE compra_id = $1 AND id != $2 AND estado NOT IN ('trato_cerrado', 'completado');
    `;
    await pool.query(query, [compraId, ordenGanadoraId]);
  },

  async getFabricantesSugeridos(
    formato: string | null,
    zonaId: number | null,
    provinciaPrefix: string | null,
  ) {
    const query = `
      SELECT u.id, u.zona_id, u.puntuacion, u.tagline
      FROM usuarios u
      WHERE u.rol_principal = 'fabricante'
        AND ($1::text IS NULL OR EXISTS (
          SELECT 1 FROM fabricante_tecnologias ft
          WHERE ft.fabricante_id = u.id AND ft.disponible = true AND ft.tecnologia = $1
        ))
      ORDER BY
        CASE
          WHEN $2::int IS NOT NULL AND u.zona_id = $2 THEN 0
          WHEN $3::text IS NOT NULL AND u.zona_id IS NOT NULL AND (
            CASE
              WHEN length(u.zona_id::text) IN (8, 5) THEN substring(u.zona_id::text, 1, 2)
              WHEN length(u.zona_id::text) IN (7, 4) THEN '0' || substring(u.zona_id::text, 1, 1)
            END
          ) = $3::text THEN 1
          ELSE 2
        END,
        u.puntuacion DESC;
    `;
    const result = await pool.query(query, [formato, zonaId, provinciaPrefix]);
    return result.rows;
  },
};
