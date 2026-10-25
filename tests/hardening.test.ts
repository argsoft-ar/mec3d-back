import type { Request, Response } from "express";
import {
  createProductSchema,
  listProductsSchema,
  isAllowedAssetUrl,
  isTrustedAssetHost,
  precioPesosSchema,
  MAX_PRECIO_BASE,
} from "../src/schemas/diseno.schema";
import {
  crearOrdenesFabricacionSchema,
  cerrarTratoBodySchema,
  fabricantesSugeridosSchema,
  MAX_FABRICANTES_POR_SOLICITUD,
} from "../src/schemas/orden-fabricacion.schema";
import { getFabricantesSchema } from "../src/schemas/usuario.schema";
import { zonaIdQuerySchema } from "../src/schemas/common.schema";
import { pesosACentavos } from "../src/utils/money.util";
import {
  MAX_INTENTOS_CODIGO,
  generarCodigoEntrega,
  hashCodigoEntrega,
  verificarCodigoEntrega,
} from "../src/utils/delivery-code.util";
import { mapPgError } from "../src/utils/pg-error.util";
import { errorHandler } from "../src/middlewares/error.middleware";
import { ValidationError } from "../src/errors/app-error";
import { catalogoRepository } from "../src/repositories/catalogo.repository";
import { catalogoService } from "../src/services/catalogo.service";
import { assertDestructiveAllowed } from "../src/database/guard";

jest.mock("../src/repositories/catalogo.repository", () => ({
  catalogoRepository: { findCategoriaByNombre: jest.fn() },
}));

const UUID_A = "3f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const UUID_B = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const env = {
  NODE_ENV: "production",
  R2_PUBLIC_URL: "https://cdn.test.example",
  CLOUDINARY_CLOUD_NAME: "mi-cloud",
} as NodeJS.ProcessEnv;

describe("allowlist de URLs de assets", () => {
  it("acepta archivos del bucket R2 bajo mec3d/modelos/", () => {
    expect(
      isAllowedAssetUrl(
        "https://cdn.test.example/mec3d/modelos/a.stl",
        "archivo",
        env,
      ),
    ).toBe(true);
  });

  it.each([
    ["http plano", "http://cdn.test.example/mec3d/modelos/a.stl"],
    ["host ajeno", "https://evil.example/mec3d/modelos/a.stl"],
    [
      "subdominio engañoso",
      "https://cdn.test.example.evil.com/mec3d/modelos/a.stl",
    ],
    [
      "credenciales embebidas",
      "https://user:pw@cdn.test.example/mec3d/modelos/a.stl",
    ],
    ["carpeta ajena", "https://cdn.test.example/otra/a.stl"],
    ["puerto no estándar", "https://cdn.test.example:8443/mec3d/modelos/a.stl"],
    ["esquema javascript", "javascript:alert(1)"],
    ["no es URL", "no-es-url"],
  ])("rechaza archivo con %s", (_n, url) => {
    expect(isAllowedAssetUrl(url, "archivo", env)).toBe(false);
  });

  it("acepta imágenes de Cloudinary propias y rechaza otras cuentas", () => {
    expect(
      isAllowedAssetUrl(
        "https://res.cloudinary.com/mi-cloud/image/upload/v1/mec3d/portadas/x.png",
        "imagen",
        env,
      ),
    ).toBe(true);
    expect(
      isAllowedAssetUrl(
        "https://res.cloudinary.com/otra/image/upload/v1/mec3d/portadas/x.png",
        "imagen",
        env,
      ),
    ).toBe(false);
  });

  it("localhost solo se permite fuera de producción", () => {
    const url = "http://localhost:9000/mec3d/modelos/a.stl";
    expect(isAllowedAssetUrl(url, "archivo", env)).toBe(false);
    expect(
      isAllowedAssetUrl(url, "archivo", { ...env, NODE_ENV: "development" }),
    ).toBe(true);
  });

  it("isTrustedAssetHost exige https + host de la allowlist", () => {
    expect(
      isTrustedAssetHost("https://cdn.test.example/legacy/x.stl", env),
    ).toBe(true);
    expect(isTrustedAssetHost("http://cdn.test.example/x.stl", env)).toBe(
      false,
    );
    expect(isTrustedAssetHost("https://evil.example/x.stl", env)).toBe(false);
  });

  it("ALLOWED_ASSET_HOSTS agrega hosts extra", () => {
    const extra = {
      ...env,
      ALLOWED_ASSET_HOSTS: "files.legacy.example",
    } as NodeJS.ProcessEnv;
    expect(
      isTrustedAssetHost("https://files.legacy.example/x.stl", extra),
    ).toBe(true);
  });

  it("los schemas usan la misma validación para archivoUrl e imagenUrl", () => {
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      const base = {
        titulo: "Engranaje",
        precioBase: 100,
        tecnologia: "Impresión 3D",
        materiales: ["PLA"],
      };
      const ok = createProductSchema.safeParse({
        body: {
          ...base,
          archivoUrl: "https://cdn.test.example/mec3d/modelos/a.stl",
        },
      });
      const badArchivo = createProductSchema.safeParse({
        body: { ...base, archivoUrl: "https://evil.example/a.stl" },
      });
      const badImagen = createProductSchema.safeParse({
        body: {
          ...base,
          archivoUrl: "https://cdn.test.example/mec3d/modelos/a.stl",
          imagenUrl: "https://evil.example/x.png",
        },
      });
      expect(ok.success).toBe(true);
      expect(badArchivo.success).toBe(false);
      expect(badImagen.success).toBe(false);
    } finally {
      process.env = prev;
    }
  });
});

describe("precio de negociación", () => {
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["cero", 0],
    ["negativo", -5],
    ["sobre el máximo", MAX_PRECIO_BASE + 0.01],
    ["3 decimales", 10.001],
    ["string", "100"],
  ])("rechaza %s", (_n, precio) => {
    expect(cerrarTratoBodySchema.safeParse({ body: { precio } }).success).toBe(
      false,
    );
  });

  it("acepta el máximo y precios con 2 decimales", () => {
    expect(precioPesosSchema.safeParse(MAX_PRECIO_BASE).success).toBe(true);
    expect(precioPesosSchema.safeParse(1500.55).success).toBe(true);
  });

  it("la comparación en centavos absorbe el error de punto flotante", () => {
    expect(pesosACentavos(0.1 + 0.2)).toBe(pesosACentavos(0.3));
    expect(pesosACentavos("1500.50")).toBe(pesosACentavos(1500.5));
    expect(() => pesosACentavos(Number.NaN)).toThrow();
    expect(() => pesosACentavos(10.001)).toThrow();
  });
});

describe("fabricanteIds", () => {
  const parse = (fabricanteIds: unknown) =>
    crearOrdenesFabricacionSchema.safeParse({
      body: { compraId: UUID_A, fabricanteIds },
    });

  it("exige al menos 1 y como máximo 10", () => {
    expect(parse([]).success).toBe(false);
    const diez = Array.from(
      { length: MAX_FABRICANTES_POR_SOLICITUD },
      (_, i) => `4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e${(10 + i).toString()}`,
    );
    expect(parse(diez).success).toBe(true);
    expect(parse([...diez, UUID_A]).success).toBe(false);
  });

  it("colapsa duplicados sin distinguir mayúsculas", () => {
    const r = crearOrdenesFabricacionSchema.parse({
      body: {
        compraId: UUID_A,
        fabricanteIds: [UUID_B, UUID_B.toUpperCase(), UUID_A],
      },
    });
    expect(r.body.fabricanteIds).toEqual([UUID_B, UUID_A]);
  });

  it("rechaza ids que no son UUID", () => {
    expect(parse(["abc"]).success).toBe(false);
  });
});

describe("límites de paginación y zonaId", () => {
  it("fabricantes: limit máximo 50", () => {
    expect(
      getFabricantesSchema.safeParse({ query: { limit: "50" } }).success,
    ).toBe(true);
    expect(
      getFabricantesSchema.safeParse({ query: { limit: "51" } }).success,
    ).toBe(false);
    expect(getFabricantesSchema.parse({ query: {} }).query.limit).toBe(50);
    expect(
      fabricantesSugeridosSchema.safeParse({
        query: { disenoId: UUID_A, compraId: UUID_A, limit: "51" },
      }).success,
    ).toBe(false);
  });

  it.each(["1", "12345678"])("zonaId %s es válido", (z) => {
    expect(zonaIdQuerySchema.safeParse(z).success).toBe(true);
  });

  it.each(["", "123456789", "-1", "1e3", "1.5", "abc", "0x10"])(
    "zonaId %p es inválido",
    (z) => {
      expect(zonaIdQuerySchema.safeParse(z).success).toBe(false);
    },
  );
});

describe("código de entrega (HMAC)", () => {
  const secret = "s".repeat(32);

  it("genera códigos de 6 dígitos", () => {
    for (let i = 0; i < 50; i++)
      expect(generarCodigoEntrega()).toMatch(/^\d{6}$/);
  });

  it("el hash es hex de 64 caracteres y no contiene el código", () => {
    const hash = hashCodigoEntrega(UUID_A, "123456", secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
  });

  it("verifica el código correcto y rechaza el incorrecto", () => {
    const hash = hashCodigoEntrega(UUID_A, "123456", secret);
    expect(verificarCodigoEntrega(UUID_A, "123456", hash, secret)).toBe(true);
    expect(verificarCodigoEntrega(UUID_A, "654321", hash, secret)).toBe(false);
  });

  it("está ligado a la orden y al secreto", () => {
    const hash = hashCodigoEntrega(UUID_A, "123456", secret);
    expect(verificarCodigoEntrega(UUID_B, "123456", hash, secret)).toBe(false);
    expect(verificarCodigoEntrega(UUID_A, "123456", hash, "x".repeat(32))).toBe(
      false,
    );
  });

  it("un hash ausente o corrupto nunca coincide", () => {
    expect(verificarCodigoEntrega(UUID_A, "123456", null, secret)).toBe(false);
    expect(verificarCodigoEntrega(UUID_A, "123456", undefined, secret)).toBe(
      false,
    );
    expect(verificarCodigoEntrega(UUID_A, "123456", "zz", secret)).toBe(false);
  });

  it("limita los intentos fallidos", () => {
    expect(MAX_INTENTOS_CODIGO).toBe(5);
  });
});

describe("mapeo de errores de PostgreSQL", () => {
  it.each([
    ["23505", 409],
    ["23503", 409],
    ["22003", 400],
    ["22001", 400],
    ["22P02", 400],
    ["23514", 400],
  ])("%s -> %i", (code, status) => {
    expect(mapPgError({ code })?.status).toBe(status);
  });

  it("ignora códigos desconocidos y errores sin código", () => {
    expect(mapPgError({ code: "XX000" })).toBeNull();
    expect(mapPgError(new Error("x"))).toBeNull();
    expect(mapPgError(null)).toBeNull();
  });

  const run = (err: Error) => {
    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json }),
    } as unknown as Response;
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    errorHandler(err, { path: "/x", method: "GET" } as Request, res, jest.fn());
    return {
      status: (res.status as jest.Mock).mock.calls[0][0],
      body: json.mock.calls[0][0],
    };
  };

  afterEach(() => jest.restoreAllMocks());

  it("errorHandler responde 409/400 sin filtrar detalles del driver", () => {
    const pgErr = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "usuarios_email_key"',
      ),
      {
        code: "23505",
        detail: "Key (email)=(a@b.com) already exists.",
        constraint: "usuarios_email_key",
      },
    );
    const conflict = run(pgErr);
    expect(conflict.status).toBe(409);
    expect(JSON.stringify(conflict.body)).not.toMatch(
      /usuarios_email_key|a@b\.com|duplicate/,
    );

    const invalid = run(
      Object.assign(new Error('invalid input syntax for type uuid: "x"'), {
        code: "22P02",
      }),
    );
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).not.toMatch(/uuid|syntax/);
  });

  it("un error desconocido sigue siendo 500 genérico", () => {
    const r = run(new Error("boom interno"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("boom");
  });
});

describe("scripts destructivos de DB", () => {
  it("abortan en producción incluso con --force", () => {
    expect(() =>
      assertDestructiveAllowed("db:init", ["--force"], {}, "production"),
    ).toThrow(/production/);
  });

  it("exigen --force o CONFIRM_DESTRUCTIVE=yes", () => {
    expect(() =>
      assertDestructiveAllowed("db:init", [], {}, "development"),
    ).toThrow(/--force/);
    expect(() =>
      assertDestructiveAllowed("db:init", ["--force"], {}, "development"),
    ).not.toThrow();
    expect(() =>
      assertDestructiveAllowed(
        "db:init",
        [],
        { CONFIRM_DESTRUCTIVE: "yes" },
        "development",
      ),
    ).not.toThrow();
    expect(() =>
      assertDestructiveAllowed(
        "db:init",
        [],
        { CONFIRM_DESTRUCTIVE: "true" },
        "development",
      ),
    ).toThrow();
  });
});

describe("categoria", () => {
  const find = catalogoRepository.findCategoriaByNombre as unknown as jest.Mock;

  beforeEach(() => find.mockReset());

  it("sin nombre no consulta ni crea nada", async () => {
    await expect(
      catalogoService.resolverCategoriaId(undefined),
    ).resolves.toBeNull();
    await expect(catalogoService.resolverCategoriaId("")).resolves.toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("devuelve el id de una categoría existente", async () => {
    find.mockResolvedValue({ id: 7, nombre: "Autos" });
    await expect(catalogoService.resolverCategoriaId("  Autos ")).resolves.toBe(
      7,
    );
    expect(find).toHaveBeenCalledWith("Autos");
  });

  it("responde 400 si la categoría no existe", async () => {
    find.mockResolvedValue(null);
    const err = await catalogoService
      .resolverCategoriaId("Inventada")
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as ValidationError).statusCode).toBe(400);
  });

  it("los schemas limitan categoria a 100 caracteres", () => {
    expect(
      listProductsSchema.safeParse({ query: { categoria: "a".repeat(100) } })
        .success,
    ).toBe(true);
    expect(
      listProductsSchema.safeParse({ query: { categoria: "a".repeat(101) } })
        .success,
    ).toBe(false);
  });
});
