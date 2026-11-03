process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";

const mockFindById = jest.fn();
jest.mock("../src/repositories/user.repository", () => ({
  userRepository: { findById: (...args: unknown[]) => mockFindById(...args) },
}));

import request from "supertest";
import app from "../src/app";
import { generateToken } from "../src/utils/jwt.util";
import { ordenFabricacionRepository } from "../src/repositories/orden-fabricacion.repository";
import { ordenFabricacionService } from "../src/services/orden-fabricacion.service";
import { archivoService } from "../src/services/archivo.service";
import {
  fabricantesSugeridosSchema,
  MAX_ZONAS_FILTRO,
} from "../src/schemas/orden-fabricacion.schema";

jest.setTimeout(30_000);

const ORDEN_ID = "1a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRA_ID = "2a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const DISENO_ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FABRICANTE = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const AJENO = "7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const auth = (id: string, rol: "comprador" | "fabricante" = "comprador") =>
  `Bearer ${generateToken({ id, email: "x@mec3d.com", rolPrincipal: rol })}`;

const BASE = "/api/v1/ordenes-fabricacion";

const filaDiseno = (extra: Record<string, unknown> = {}) => ({
  orden_id: ORDEN_ID,
  estado: "en_negociacion",
  fabricante_id: FABRICANTE,
  id_comprador: COMPRADOR,
  compra_estado: "pendiente_pago",
  material_nombre: "PLA",
  diseno_id: DISENO_ID,
  titulo: "Soporte",
  descripcion: null,
  imagen_url: null,
  tiene_preview: false,
  formato: "STL",
  peso_gramos: 35,
  especificaciones: null,
  categoria_nombre: "Autos",
  tecnologia_nombre: "FDM",
  materiales_nombres: ["PLA"],
  archivo_url: "https://r2.example/secreto.stl",
  ...extra,
});

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  mockFindById.mockReset();
});

describe("GET /ordenes-fabricacion/:id/diseno", () => {
  it.each([COMPRADOR, FABRICANTE])(
    "participante %s: 200 con specs y sin archivoUrl",
    async (userId) => {
      jest
        .spyOn(ordenFabricacionRepository, "getDisenoDeOrden")
        .mockResolvedValue(filaDiseno());
      const res = await request(app)
        .get(`${BASE}/${ORDEN_ID}/diseno`)
        .set("Authorization", auth(userId));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        ordenId: ORDEN_ID,
        estado: "en_negociacion",
        puedeDescargar: false,
        diseno: { id: DISENO_ID, titulo: "Soporte", materiales: ["PLA"] },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/archivo_?url|secreto/i);
    },
  );

  it("no participante: 403", async () => {
    jest
      .spyOn(ordenFabricacionRepository, "getDisenoDeOrden")
      .mockResolvedValue(filaDiseno());
    const res = await request(app)
      .get(`${BASE}/${ORDEN_ID}/diseno`)
      .set("Authorization", auth(AJENO));
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("data");
  });

  it("puedeDescargar es false antes del trato cerrado y true con trato cerrado y pago", async () => {
    const spy = jest
      .spyOn(ordenFabricacionRepository, "getDisenoDeOrden")
      .mockResolvedValue(filaDiseno({ estado: "en_negociacion" }));
    const antes = await request(app)
      .get(`${BASE}/${ORDEN_ID}/diseno`)
      .set("Authorization", auth(FABRICANTE, "fabricante"));
    expect(antes.body.data.puedeDescargar).toBe(false);

    spy.mockResolvedValue(
      filaDiseno({ estado: "trato_cerrado", compra_estado: "pagada" }),
    );
    const despues = await request(app)
      .get(`${BASE}/${ORDEN_ID}/diseno`)
      .set("Authorization", auth(FABRICANTE, "fabricante"));
    expect(despues.body.data.puedeDescargar).toBe(true);
  });

  it("exige token y un id UUID", async () => {
    expect((await request(app).get(`${BASE}/${ORDEN_ID}/diseno`)).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .get(`${BASE}/no-uuid/diseno`)
          .set("Authorization", auth(COMPRADOR))
      ).status,
    ).toBe(400);
  });
});

describe("GET /ordenes-fabricacion/:id/descargar-diseno", () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    fabricante_id: FABRICANTE,
    estado: "trato_cerrado",
    compra_estado: "pagada",
    archivo_url: "https://r2.example/a.stl",
    ...extra,
  });

  it("antes del cierre del trato: 409 y no firma la URL", async () => {
    jest
      .spyOn(ordenFabricacionRepository, "getArchivoParaDescarga")
      .mockResolvedValue(fila({ estado: "en_negociacion" }));
    const firmar = jest.spyOn(archivoService, "firmarUrl");
    const res = await request(app)
      .get(`${BASE}/${ORDEN_ID}/descargar-diseno`)
      .set("Authorization", auth(FABRICANTE, "fabricante"));
    expect(res.status).toBe(409);
    expect(firmar).not.toHaveBeenCalled();
  });

  it("el comprador no descarga: 403", async () => {
    jest
      .spyOn(ordenFabricacionRepository, "getArchivoParaDescarga")
      .mockResolvedValue(fila());
    const res = await request(app)
      .get(`${BASE}/${ORDEN_ID}/descargar-diseno`)
      .set("Authorization", auth(COMPRADOR));
    expect(res.status).toBe(403);
  });

  it("fabricante con trato cerrado y pago: 302 a la URL firmada, no-store", async () => {
    jest
      .spyOn(ordenFabricacionRepository, "getArchivoParaDescarga")
      .mockResolvedValue(fila());
    jest.spyOn(archivoService, "firmarUrl").mockResolvedValue({
      url: "https://signed.example/a.stl",
      expiresIn: 300,
    });
    const res = await request(app)
      .get(`${BASE}/${ORDEN_ID}/descargar-diseno`)
      .set("Authorization", auth(FABRICANTE, "fabricante"));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://signed.example/a.stl");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("GET /ordenes-fabricacion/fabricante/cerradas", () => {
  it("no fabricante (rol releído de la DB): 403", async () => {
    mockFindById.mockResolvedValue({
      id: COMPRADOR,
      rol_principal: "comprador",
    });
    const repo = jest.spyOn(
      ordenFabricacionRepository,
      "getCerradasPorFabricante",
    );
    const res = await request(app)
      .get(`${BASE}/fabricante/cerradas`)
      .set("Authorization", auth(COMPRADOR, "fabricante"));
    expect(res.status).toBe(403);
    expect(repo).not.toHaveBeenCalled();
  });

  it("fabricante: 200 con data y meta (no colisiona con /:id)", async () => {
    mockFindById.mockResolvedValue({
      id: FABRICANTE,
      rol_principal: "fabricante",
    });
    const repo = jest
      .spyOn(ordenFabricacionRepository, "getCerradasPorFabricante")
      .mockResolvedValue({ rows: [], total: 0 });
    const res = await request(app)
      .get(`${BASE}/fabricante/cerradas?page=2&limit=5`)
      .set("Authorization", auth(FABRICANTE, "fabricante"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      meta: { page: 2, limit: 5, total: 0, totalPages: 0 },
    });
    expect(repo).toHaveBeenCalledWith(
      FABRICANTE,
      ["trato_cerrado", "confirmada", "completado"],
      5,
      5,
    );
  });

  it("valida la paginación", async () => {
    const res = await request(app)
      .get(`${BASE}/fabricante/cerradas?limit=0`)
      .set("Authorization", auth(FABRICANTE, "fabricante"));
    expect(res.status).toBe(400);
  });
});

describe("POST /ordenes-fabricacion/:id/cerrar-trato", () => {
  it("el fabricante recibe 403 'Solo el comprador puede aceptar el presupuesto'", async () => {
    jest.spyOn(ordenFabricacionRepository, "getById").mockResolvedValue({
      id: ORDEN_ID,
      compra_id: COMPRA_ID,
      fabricante_id: FABRICANTE,
      id_comprador: COMPRADOR,
      estado: "en_negociacion",
    });
    const lock = jest.spyOn(ordenFabricacionRepository, "lockById");
    const res = await request(app)
      .post(`${BASE}/${ORDEN_ID}/cerrar-trato`)
      .set("Authorization", auth(FABRICANTE, "fabricante"))
      .send({ precio: 1500 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      "Solo el comprador puede aceptar el presupuesto",
    );
    expect(lock).not.toHaveBeenCalled();
  });

  it("valida el precio", async () => {
    const res = await request(app)
      .post(`${BASE}/${ORDEN_ID}/cerrar-trato`)
      .set("Authorization", auth(COMPRADOR))
      .send({ precio: -1 });
    expect(res.status).toBe(400);
  });
});

describe("GET /ordenes-fabricacion/fabricantes-sugeridos: filtros de zona", () => {
  const base = `${BASE}/fabricantes-sugeridos?disenoId=${DISENO_ID}&compraId=${COMPRA_ID}`;

  const spyServicio = () =>
    jest
      .spyOn(ordenFabricacionService, "fabricantesSugeridos")
      .mockResolvedValue([]);

  it("acepta listas separadas por coma y normaliza los códigos", async () => {
    const spy = spyServicio();
    const res = await request(app)
      .get(
        `${base}&provincias=6,02&departamentos=6007&localidades=06007010,6007010000`,
      )
      .set("Authorization", auth(COMPRADOR));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(
      DISENO_ID,
      COMPRA_ID,
      COMPRADOR,
      1,
      50,
      undefined,
      {
        provincias: ["06", "02"],
        departamentos: ["06007"],
        localidades: ["06007010", "06007010000"],
      },
    );
  });

  it("acepta parámetros repetidos y colapsa duplicados", async () => {
    const spy = spyServicio();
    const res = await request(app)
      .get(`${base}&provincias=06&provincias=02&provincias=6`)
      .set("Authorization", auth(COMPRADOR));
    expect(res.status).toBe(200);
    expect(spy.mock.calls[0][6]).toEqual({
      provincias: ["06", "02"],
      departamentos: [],
      localidades: [],
    });
  });

  it("sin filtros manda arrays vacíos", async () => {
    const spy = spyServicio();
    await request(app).get(base).set("Authorization", auth(COMPRADOR));
    expect(spy.mock.calls[0][6]).toEqual({
      provincias: [],
      departamentos: [],
      localidades: [],
    });
  });

  it.each([
    "provincias=0a",
    "provincias=123",
    "provincias=06;DROP TABLE usuarios",
    "departamentos=123",
    "departamentos=123456",
    "localidades=123456789",
    "localidades=123456789012",
    "localidades=06007010'--",
  ])("rechaza %s con 400 sin llegar al service", async (filtro) => {
    const spy = spyServicio();
    const res = await request(app)
      .get(`${base}&${encodeURI(filtro)}`)
      .set("Authorization", auth(COMPRADOR));
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it(`rechaza más de ${MAX_ZONAS_FILTRO} valores`, async () => {
    const spy = spyServicio();
    const muchos = Array.from({ length: MAX_ZONAS_FILTRO + 1 }, (_, i) =>
      String(i % 100).padStart(2, "0"),
    ).join(",");
    const res = await request(app)
      .get(`${base}&provincias=${muchos}`)
      .set("Authorization", auth(COMPRADOR));
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("fabricantesSugeridosSchema: parseo de zonas", () => {
  const parse = (extra: Record<string, unknown>) =>
    fabricantesSugeridosSchema.safeParse({
      query: { disenoId: DISENO_ID, compraId: COMPRA_ID, ...extra },
    });

  it("lista indexada que qs convierte en objeto", () => {
    const r = parse({ provincias: { 0: "06", 1: "2" } });
    expect(r.success && r.data.query.provincias).toEqual(["06", "02"]);
  });

  it("mezcla de repetidos y comas, con espacios y vacíos", () => {
    const r = parse({ localidades: ["06007010, 6007010000", "", "06007010"] });
    expect(r.success && r.data.query.localidades).toEqual([
      "06007010",
      "06007010000",
    ]);
  });

  it("ausente queda undefined", () => {
    const r = parse({});
    expect(r.success && r.data.query.provincias).toBeUndefined();
  });

  it("valores no string se rechazan", () => {
    expect(parse({ provincias: [{ a: "06" }] }).success).toBe(false);
  });

  it("exactamente el máximo de valores es válido", () => {
    const valores = Array.from({ length: MAX_ZONAS_FILTRO }, (_, i) =>
      String(i).padStart(5, "0"),
    );
    expect(parse({ departamentos: valores }).success).toBe(true);
    expect(parse({ departamentos: [...valores, "99999"] }).success).toBe(false);
  });
});
