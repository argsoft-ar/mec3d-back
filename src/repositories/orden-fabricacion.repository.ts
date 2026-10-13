import pool from "../config/db.config";
import { Db } from "../utils/transaction.util";

// Fragmento compartido de compatibilidad; asume $1 = tecnologiaId (int) y
// $2 = materialIds (int[]) y el alias `u` sobre usuarios.
const FABRICANTE_COMPATIBLE_SQL = `
  EXISTS (
    SELECT 1 FROM fabricante_tecnologias ft
    WHERE ft.fabricante_id = u.id AND ft.disponible = true AND ft.tecnologia_id = $1::int
  )
  AND EXISTS (
    SELECT 1 FROM fabricante_materiales fm
    WHERE fm.fabricante_id = u.id AND fm.disponible = true
      AND fm.material_id = ANY($2::int[])
  )`;

export const ordenFabricacionRepository = {
  async createOne(compraId: string, fabricanteId: string, db: Db = pool) {
    const query = `
      INSERT INTO ordenes_fabricacion (compra_id, fabricante_id)
      VALUES ($1, $2)
      RETURNING id, compra_id, fabricante_id, estado, precio_acordado,
                precio_propuesto_comprador, precio_propuesto_fabricante,
                cerrado_por_comprador, cerrado_por_fabricante, cerrado_en, creado_en,
                codigo_entrega_generado_en, entrega_confirmada, entregado_en;
    `;
    const result = await db.query(query, [compraId, fabricanteId]);
    return result.rows[0];
  },

  // Regla de negocio: un mismo fabricante no puede tener más de una orden/conversación
  // activa con el mismo comprador para la misma compra. "Activa" excluye canceladas y
  // rechazadas, que sí permiten volver a solicitar fabricación desde cero.
  async getActivaPorCompradorYFabricante(
    compradorId: string,
    fabricanteId: string,
    disenoId: string,
    compraId: string,
    db: Db = pool,
  ) {
    const query = `
      SELECT o.*, c.id_comprador
      FROM ordenes_fabricacion o
      JOIN compras c ON c.id = o.compra_id
      WHERE c.id_comprador = $1 AND o.fabricante_id = $2 AND c.id_modelo = $3
        AND o.compra_id = $4
        AND o.estado NOT IN ('cancelado', 'rechazado')
      ORDER BY o.creado_en DESC
      LIMIT 1;
    `;
    const result = await db.query(query, [
      compradorId,
      fabricanteId,
      disenoId,
      compraId,
    ]);
    return result.rows[0] ?? null;
  },

  // ¿Hay órdenes de fabricación activas (ni canceladas, rechazadas ni completadas) sobre el diseño?
  async existeActivaPorDiseno(
    disenoId: string,
    db: Db = pool,
  ): Promise<boolean> {
    const result = await db.query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM ordenes_fabricacion o
         JOIN compras c ON c.id = o.compra_id
         WHERE c.id_modelo = $1
           AND o.estado NOT IN ('cancelado', 'rechazado', 'completado')
       ) AS existe;`,
      [disenoId],
    );
    return result.rows[0].existe;
  },

  // Se trae id_comprador de la compra asociada para poder resolver el rol del
  // solicitante (comprador o fabricante) sin un join extra en cada consumidor.
  async getById(id: string, db: Db = pool) {
    const query = `
      SELECT o.*, c.id_comprador, c.estado AS compra_estado
      FROM ordenes_fabricacion o
      JOIN compras c ON c.id = o.compra_id
      WHERE o.id = $1;
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] ?? null;
  },

  // Segundo lock de la jerarquía compra -> orden -> pago: la compra ya debe estar bloqueada.
  async lockById(db: Db, id: string) {
    const query = `
      SELECT o.*, c.id_comprador, c.estado AS compra_estado
      FROM ordenes_fabricacion o
      JOIN compras c ON c.id = o.compra_id
      WHERE o.id = $1
      FOR UPDATE OF o;
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] ?? null;
  },

  // Orden con trato cerrado (o más avanzada) de una compra: la que respalda el pago.
  async lockCerradaPorCompra(db: Db, compraId: string) {
    const query = `
      SELECT o.*
      FROM ordenes_fabricacion o
      WHERE o.compra_id = $1 AND o.estado IN ('trato_cerrado', 'confirmada', 'en_disputa', 'completado')
      FOR UPDATE;
    `;
    const result = await db.query(query, [compraId]);
    return result.rows[0] ?? null;
  },

  // Guard atómico: solo se propone precio mientras la orden está abierta.
  async proponerPrecio(
    id: string,
    role: "comprador" | "fabricante",
    precio: number,
    db: Db = pool,
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
      WHERE id = $2 AND estado IN ('solicitado', 'en_negociacion')
      RETURNING *;
    `;
    const result = await db.query(query, [precio, id]);
    return result.rows[0] ?? null;
  },

  // Mismo guard que proponerPrecio: no se puede marcar cierre sobre una orden ya cerrada/cancelada.
  async marcarCierre(
    id: string,
    role: "comprador" | "fabricante",
    precio: number,
    db: Db = pool,
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
      WHERE id = $2 AND estado IN ('solicitado', 'en_negociacion')
      RETURNING *;
    `;
    const result = await db.query(query, [precio, id]);
    return result.rows[0] ?? null;
  },

  // Guard atomico (WHERE estado IN abiertos): si dos peticiones concurrentes llegan a
  // cerrar el mismo trato, solo la primera actualiza la fila; la segunda recibe 0 filas.
  async finalizarTrato(id: string, precioAcordado: number, db: Db = pool) {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'trato_cerrado', precio_acordado = $1, cerrado_en = now()
      WHERE id = $2 AND estado IN ('solicitado', 'en_negociacion')
      RETURNING *;
    `;
    const result = await db.query(query, [precioAcordado, id]);
    return result.rows[0] ?? null;
  },

  // El comprador eligió un fabricante: las demás órdenes abiertas de la misma compra se cancelan.
  // Devuelve cuántas se cancelaron (puede ser 0 si no había hermanas abiertas).
  async cancelarHermanas(
    compraId: string,
    ordenGanadoraId: string,
    db: Db = pool,
  ): Promise<number> {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'cancelado'
      WHERE compra_id = $1 AND id != $2
        AND estado IN ('solicitado', 'en_negociacion');
    `;
    const result = await db.query(query, [compraId, ordenGanadoraId]);
    return result.rowCount ?? 0;
  },

  // Guarda el HMAC del código vigente y reinicia el contador de intentos fallidos: cada
  // código nuevo invalida al anterior y desbloquea la orden.
  async guardarCodigoEntrega(id: string, codigoHash: string, db: Db = pool) {
    const query = `
      UPDATE ordenes_fabricacion
      SET codigo_entrega_hash = $1, codigo_entrega_generado_en = now(), intentos_codigo = 0
      WHERE id = $2 AND estado IN ('trato_cerrado', 'confirmada')
      RETURNING id;
    `;
    const result = await db.query(query, [codigoHash, id]);
    return result.rows[0] ?? null;
  },

  // Reserva atómica de un intento de validación: solo prospera mientras queden intentos, de
  // modo que ni siquiera requests concurrentes pueden superar el máximo. Devuelve el
  // número de intentos consumidos o null si la orden está bloqueada o ya no está 'confirmada'.
  async reservarIntentoCodigo(
    id: string,
    maxIntentos: number,
    db: Db = pool,
  ): Promise<number | null> {
    const query = `
      UPDATE ordenes_fabricacion
      SET intentos_codigo = intentos_codigo + 1
      WHERE id = $1 AND estado = 'confirmada' AND intentos_codigo < $2
      RETURNING intentos_codigo;
    `;
    const result = await db.query<{ intentos_codigo: number }>(query, [
      id,
      maxIntentos,
    ]);
    return result.rows[0]?.intentos_codigo ?? null;
  },

  // Cancelación antes del cierre: no se puede cancelar una orden ya declarada recibida
  // ('confirmada'), en disputa, completada, rechazada o cancelada.
  async cancelar(db: Db, id: string) {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'cancelado'
      WHERE id = $1 AND estado IN ('solicitado', 'en_negociacion', 'trato_cerrado')
      RETURNING *;
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] ?? null;
  },

  // Reembolso iniciado en MP: la orden en curso deja de ser válida.
  async cancelarCerradaPorCompra(db: Db, compraId: string): Promise<number> {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'cancelado'
      WHERE compra_id = $1 AND estado IN ('trato_cerrado', 'confirmada', 'en_disputa');
    `;
    const result = await db.query(query, [compraId]);
    return result.rowCount ?? 0;
  },

  // Guard atomico (WHERE estado = 'trato_cerrado'): el comprador declara la entrega
  // una sola vez; la orden queda "confirmada" a la espera de que el fabricante valide
  // el código.
  async declararEntrega(id: string, db: Db = pool) {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'confirmada', confirmada_en = now()
      WHERE id = $1 AND estado = 'trato_cerrado'
      RETURNING *;
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] ?? null;
  },

  // Guard atomico (WHERE estado = 'confirmada'): el fabricante solo puede finalizar
  // la entrega despues de que el comprador la haya declarado.
  async confirmarEntrega(id: string, db: Db = pool) {
    const query = `
      UPDATE ordenes_fabricacion
      SET estado = 'completado', entrega_confirmada = true, entregado_en = now()
      WHERE id = $1 AND estado = 'confirmada'
      RETURNING *;
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] ?? null;
  },

  // ── Disputas ─────────────────────────────────────────────────────────────
  // El comprador congela los fondos: mientras la orden está 'en_disputa' no se puede confirmar
  // la entrega, cancelar ni descargar el archivo.
  async abrirDisputa(db: Db, id: string, compradorId: string, motivo: string) {
    const result = await db.query(
      `UPDATE ordenes_fabricacion
       SET estado = 'en_disputa', disputa_motivo = $3, disputa_abierta_por = $2,
           disputa_abierta_en = now()
       WHERE id = $1 AND estado IN ('confirmada', 'trato_cerrado')
       RETURNING *;`,
      [id, compradorId, motivo],
    );
    return result.rows[0] ?? null;
  },

  // liberar_fabricante -> 'completado' (el admin certifica la entrega);
  // reembolsar_comprador -> 'cancelado'. Guard: solo prospera una vez (estado 'en_disputa').
  async resolverDisputa(
    db: Db,
    id: string,
    data: {
      resolucion: "liberar_fabricante" | "reembolsar_comprador";
      adminId: string;
      nota: string;
    },
  ) {
    const result = await db.query(
      `UPDATE ordenes_fabricacion
       SET estado = CASE WHEN $2::text = 'liberar_fabricante' THEN 'completado' ELSE 'cancelado' END,
           entrega_confirmada = entrega_confirmada OR $2::text = 'liberar_fabricante',
           entregado_en = CASE WHEN $2::text = 'liberar_fabricante' THEN now() ELSE entregado_en END,
           disputa_resolucion = $2, disputa_resuelta_por = $3, disputa_resuelta_en = now(),
           disputa_nota = $4
       WHERE id = $1 AND estado = 'en_disputa'
       RETURNING *;`,
      [id, data.resolucion, data.adminId, data.nota],
    );
    return result.rows[0] ?? null;
  },

  async listarDisputas(
    estado: "abiertas" | "resueltas",
    limit: number,
    offset: number,
  ) {
    const filtro =
      estado === "abiertas"
        ? "o.estado = 'en_disputa'"
        : "o.disputa_resolucion IS NOT NULL";
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT o.id, o.compra_id, o.fabricante_id, o.estado, o.disputa_motivo,
                o.disputa_abierta_por, o.disputa_abierta_en, o.disputa_resolucion,
                o.disputa_resuelta_por, o.disputa_resuelta_en, o.disputa_nota,
                c.id_comprador, c.monto_centavos, c.estado AS compra_estado
         FROM ordenes_fabricacion o
         JOIN compras c ON c.id = o.compra_id
         WHERE ${filtro}
         ORDER BY o.disputa_abierta_en ASC, o.id
         LIMIT $1 OFFSET $2;`,
        [limit, offset],
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM ordenes_fabricacion o WHERE ${filtro};`,
      ),
    ]);
    return { rows: rows.rows, total: Number(total.rows[0].total) };
  },

  // Órdenes 'confirmada' que superaron el plazo de entrega: se marcan para revisión de un
  // admin. Es solo un flag: nunca libera fondos ni cambia el estado de la orden.
  async marcarEntregasVencidas(timeoutDias: number): Promise<string[]> {
    const result = await pool.query<{ id: string }>(
      `UPDATE ordenes_fabricacion
       SET requiere_revision_admin = true, revision_motivo = 'entrega_vencida',
           revision_desde = now()
       WHERE estado = 'confirmada' AND NOT requiere_revision_admin
         AND COALESCE(confirmada_en, cerrado_en, creado_en) < now() - make_interval(days => $1)
       RETURNING id;`,
      [timeoutDias],
    );
    return result.rows.map((r) => r.id);
  },

  // 'completado' se excluye a propósito: la orden entregada se oculta de "mis
  // solicitudes" del fabricante pero la fila persiste intacta en la base.
  async getMisSolicitudes(fabricanteId: string) {
    const query = `
      SELECT o.*, c.id_comprador, c.id_modelo, c.estado AS compra_estado,
             d.titulo AS producto_titulo,
             conv.id AS conversacion_id
      FROM ordenes_fabricacion o
      JOIN compras c ON c.id = o.compra_id
      JOIN disenos d ON d.id = c.id_modelo
      LEFT JOIN conversaciones conv ON conv.orden_fabricacion_id = o.id
      WHERE o.fabricante_id = $1 AND o.estado != 'completado'
      ORDER BY o.creado_en DESC;
    `;
    const result = await pool.query(query, [fabricanteId]);
    return result.rows;
  },

  async getArchivoParaDescarga(ordenId: string) {
    const query = `
      SELECT o.fabricante_id, o.estado, c.estado AS compra_estado, d.archivo_url
      FROM ordenes_fabricacion o
      JOIN compras c ON c.id = o.compra_id
      JOIN disenos d ON d.id = c.id_modelo
      WHERE o.id = $1;
    `;
    const result = await pool.query(query, [ordenId]);
    return result.rows[0] ?? null;
  },

  // Compatible = tiene la tecnología del diseño disponible Y al menos uno de los
  // materiales indicados disponible. Siempre con parámetros: $1 tecnologiaId, $2 materialIds.
  // El comprador se excluye en SQL para que la paginación sea exacta.
  async getFabricantesSugeridos(
    tecnologiaId: number,
    materialIds: number[],
    zonaId: number | null,
    provinciaPrefix: string | null,
    excluirUsuarioId: string,
    limit: number,
    offset: number,
  ) {
    const query = `
      SELECT u.id, u.zona_id, u.puntuacion, u.tagline, u.username
      FROM usuarios u
      WHERE u.rol_principal = 'fabricante'
        AND u.id <> $5::uuid
        AND ${FABRICANTE_COMPATIBLE_SQL}
      ORDER BY
        CASE
          WHEN $3::int IS NOT NULL AND u.zona_id = $3 THEN 0
          WHEN $4::text IS NOT NULL AND u.zona_id IS NOT NULL AND (
            CASE
              WHEN length(u.zona_id::text) IN (8, 5) THEN substring(u.zona_id::text, 1, 2)
              WHEN length(u.zona_id::text) IN (7, 4) THEN '0' || substring(u.zona_id::text, 1, 1)
            END
          ) = $4::text THEN 1
          ELSE 2
        END,
        u.puntuacion DESC, u.id
      LIMIT $6 OFFSET $7;
    `;
    const result = await pool.query(query, [
      tecnologiaId,
      materialIds,
      zonaId,
      provinciaPrefix,
      excluirUsuarioId,
      limit,
      offset,
    ]);
    return result.rows;
  },

  // Subconjunto de fabricanteIds que cumple la misma regla de compatibilidad.
  async getIdsFabricantesCompatibles(
    fabricanteIds: string[],
    tecnologiaId: number,
    materialIds: number[],
  ): Promise<string[]> {
    const query = `
      SELECT u.id
      FROM usuarios u
      WHERE u.rol_principal = 'fabricante'
        AND u.id = ANY($3::uuid[])
        AND ${FABRICANTE_COMPATIBLE_SQL};
    `;
    const result = await pool.query<{ id: string }>(query, [
      tecnologiaId,
      materialIds,
      fabricanteIds,
    ]);
    return result.rows.map((r) => r.id);
  },
};
