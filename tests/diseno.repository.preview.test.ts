const mockQuery = jest.fn();
jest.mock("../src/config/db.config", () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { disenoRepository } from "../src/repositories/diseno.repository";

const ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const URL = "https://cdn.test.example/mec3d/modelos/a.stl";
const KEY = "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl";
const KEY_VIEJA = "previews/1a2b3c4d-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl";

beforeEach(() => mockQuery.mockReset());

describe("disenoRepository.setPreviewUrl", () => {
  it("solo escribe si el archivo sigue siendo el mismo, no hay preview y el diseño está activo", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    expect(await disenoRepository.setPreviewUrl(ID, URL, KEY)).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/archivo_url = \$2/);
    expect(sql).toMatch(/preview_url IS NULL/);
    expect(sql).toMatch(/eliminado_en IS NULL/);
    expect(params).toEqual([ID, URL, KEY]);
  });

  it("devuelve false si otra generación ya fijó el preview (0 filas)", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    expect(await disenoRepository.setPreviewUrl(ID, URL, KEY)).toBe(false);
  });

  it("con reemplazarDe exige que el preview vigente siga siendo esa clave (no pisa uno más nuevo)", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    expect(await disenoRepository.setPreviewUrl(ID, URL, KEY, KEY_VIEJA)).toBe(
      true,
    );

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/archivo_url = \$2/);
    expect(sql).toMatch(/preview_url = \$4/);
    expect(sql).not.toMatch(/preview_url IS NULL/);
    expect(sql).toMatch(/eliminado_en IS NULL/);
    expect(params).toEqual([ID, URL, KEY, KEY_VIEJA]);
  });

  it("con reemplazarDe devuelve false si el preview cambió en el medio (0 filas)", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    expect(await disenoRepository.setPreviewUrl(ID, URL, KEY, KEY_VIEJA)).toBe(
      false,
    );
  });
});

describe("disenoRepository.listarParaRegenerar", () => {
  it("incluye diseños con y sin preview, excluye eliminados y planos, y devuelve preview_url", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: ID, archivo_url: URL, preview_url: KEY }],
    });
    const filas = await disenoRepository.listarParaRegenerar(
      ID,
      10,
      "Planos técnicos",
    );

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/d\.preview_url/);
    expect(sql).not.toMatch(/preview_url IS NULL/);
    expect(sql).toMatch(/eliminado_en IS NULL/);
    expect(sql).toMatch(/ORDER BY d\.id/);
    expect(params).toEqual([ID, 10, "Planos técnicos"]);
    expect(filas[0].preview_url).toBe(KEY);
  });
});

describe("disenoRepository.deleteProduct", () => {
  it("el soft-delete devuelve id y preview_url con RETURNING", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ID, preview_url: KEY }] });
    const fila = await disenoRepository.deleteProduct(ID, "user-1");

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/eliminado_en = now\(\)/);
    expect(sql).toMatch(/RETURNING id, preview_url/);
    expect(params).toEqual([ID, "user-1"]);
    expect(fila).toEqual({ id: ID, preview_url: KEY });
  });
});

describe("preview anterior leído dentro de la transacción de escritura", () => {
  const dto = {
    titulo: "Pieza",
    archivoUrl: URL,
    precioBase: 10,
    categoriaId: null,
    tecnologiaId: null,
    materialIds: [1],
  };

  // Cliente de la transacción: responde según el SQL.
  function cliente(filaBloqueada: unknown, filaActualizada: unknown) {
    const query = jest.fn(async (sql: string) => {
      if (/FOR UPDATE/.test(sql))
        return { rows: filaBloqueada ? [filaBloqueada] : [] };
      if (/^\s*UPDATE disenos/.test(sql))
        return { rows: filaActualizada ? [filaActualizada] : [] };
      return { rows: [] };
    });
    return { query };
  }
  const sqls = (c: { query: jest.Mock }) =>
    c.query.mock.calls.map((x) => String(x[0]));

  it("PUT: bloquea la fila con SELECT ... FOR UPDATE antes del UPDATE y devuelve preview_url_anterior", async () => {
    const c = cliente(
      { preview_url: KEY_VIEJA },
      { id: ID, preview_url: null },
    );
    const fila = await disenoRepository.updateProduct(
      ID,
      "user-1",
      dto,
      c as never,
    );

    const todas = sqls(c);
    expect(todas[0]).toMatch(
      /SELECT preview_url FROM disenos[\s\S]*FOR UPDATE/,
    );
    expect(todas[1]).toMatch(/^\s*UPDATE disenos/);
    expect(fila).toMatchObject({ id: ID, preview_url_anterior: KEY_VIEJA });
  });

  it("PUT: si el diseño no es del usuario/eliminado no escribe nada", async () => {
    const c = cliente(null, null);
    expect(
      await disenoRepository.updateProduct(ID, "user-1", dto, c as never),
    ).toBeUndefined();
    expect(sqls(c)).toHaveLength(1);
  });

  it("PATCH con campos: bloquea y devuelve preview_url_anterior", async () => {
    const c = cliente(
      { preview_url: KEY_VIEJA },
      { id: ID, preview_url: null },
    );
    const fila = await disenoRepository.partialUpdateProduct(
      ID,
      "user-1",
      { archivoUrl: URL },
      undefined,
      c as never,
    );
    const todas = sqls(c);
    expect(todas[0]).toMatch(/FOR UPDATE/);
    expect(todas[1]).toMatch(/^\s*UPDATE disenos/);
    expect(fila).toMatchObject({ id: ID, preview_url_anterior: KEY_VIEJA });
  });

  it("PATCH solo de materiales: usa el preview_url de la fila bloqueada", async () => {
    const c = cliente({ id: ID, preview_url: KEY_VIEJA }, null);
    const fila = await disenoRepository.partialUpdateProduct(
      ID,
      "user-1",
      {},
      [1],
      c as never,
    );
    expect(fila).toMatchObject({ id: ID, preview_url_anterior: KEY_VIEJA });
  });
});

describe("disenoRepository.clearPreviewUrl", () => {
  it("anula preview_url solo si sigue siendo la key indicada", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await disenoRepository.clearPreviewUrl(ID, KEY);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/preview_url = NULL/);
    expect(sql).toMatch(/preview_url = \$2/);
    expect(params).toEqual([ID, KEY]);
  });
});
