import pool from "../config/db.config";

export interface TecnologiaCatalogoRow {
  id: number;
  nombre: string;
}

export interface CategoriaCatalogoRow {
  id: number;
  nombre: string;
}

export interface MaterialCatalogoRow {
  id: number;
  nombre: string;
  tecnologia_id: number;
}

export const catalogoRepository = {
  async getTecnologias(): Promise<TecnologiaCatalogoRow[]> {
    const result = await pool.query<TecnologiaCatalogoRow>(
      `SELECT id, nombre FROM tecnologias ORDER BY id;`,
    );
    return result.rows;
  },

  async getMateriales(tecnologiaId?: number): Promise<MaterialCatalogoRow[]> {
    const result = await pool.query<MaterialCatalogoRow>(
      `SELECT id, nombre, tecnologia_id
       FROM materiales
       WHERE $1::int IS NULL OR tecnologia_id = $1
       ORDER BY tecnologia_id, id;`,
      [tecnologiaId ?? null],
    );
    return result.rows;
  },

  // Match case-insensitive: el nombre canónico siempre sale del catálogo.
  async findTecnologiasByNombres(
    nombres: string[],
  ): Promise<TecnologiaCatalogoRow[]> {
    const result = await pool.query<TecnologiaCatalogoRow>(
      `SELECT id, nombre FROM tecnologias WHERE lower(nombre) = ANY($1::text[]);`,
      [nombres.map((n) => n.toLowerCase())],
    );
    return result.rows;
  },

  // Solo lectura: las categorías son un catálogo cerrado, nunca se crean desde la API.
  async findCategoriaByNombre(nombre: string): Promise<CategoriaCatalogoRow | null> {
    const result = await pool.query<CategoriaCatalogoRow>(
      `SELECT id, nombre FROM categorias WHERE lower(nombre) = lower($1) LIMIT 1;`,
      [nombre],
    );
    return result.rows[0] ?? null;
  },

  async findMaterialesByNombres(
    nombres: string[],
  ): Promise<MaterialCatalogoRow[]> {
    const result = await pool.query<MaterialCatalogoRow>(
      `SELECT id, nombre, tecnologia_id FROM materiales WHERE lower(nombre) = ANY($1::text[]);`,
      [nombres.map((n) => n.toLowerCase())],
    );
    return result.rows;
  },

  async getMaterialesDeDiseno(disenoId: string): Promise<MaterialCatalogoRow[]> {
    const result = await pool.query<MaterialCatalogoRow>(
      `SELECT m.id, m.nombre, m.tecnologia_id
       FROM diseno_materiales dm
       JOIN materiales m ON m.id = dm.material_id
       WHERE dm.diseno_id = $1
       ORDER BY m.nombre;`,
      [disenoId],
    );
    return result.rows;
  },
};
