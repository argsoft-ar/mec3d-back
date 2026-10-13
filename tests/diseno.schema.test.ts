import {
  createProductSchema,
  partialUpdateProductSchema,
  MAX_PRINT_HOURS,
  MAX_PRECIO_BASE,
} from "../src/schemas/diseno.schema";

const validBody = {
  titulo: "Engranaje",
  archivoUrl: "https://cdn.test.example/mec3d/modelos/a.stl",
  precioBase: 1500.5,
  tecnologia: "Impresión 3D",
  materiales: ["PLA", "PETG"],
  especificaciones: {
    dimensiones: "10x10x10mm",
    dificultad: "Básico",
    tiempoImpresion: 4,
    soportes: "No necesarios",
    configuracion: { layer: "0.2mm", infill: "20%" },
  },
};

const parse = (body: unknown) => createProductSchema.safeParse({ body });

const ORIGINAL_ENV = { ...process.env };
beforeAll(() => {
  process.env.R2_PUBLIC_URL = "https://cdn.test.example";
  process.env.NODE_ENV = "test";
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("createProductSchema", () => {
  it("acepta un diseño válido", () => {
    expect(parse(validBody).success).toBe(true);
  });

  it.each([
    ["materiales vacío", { materiales: [] }],
    ["materiales duplicados", { materiales: ["PLA", "pla"] }],
    ["sin tecnologia", { tecnologia: undefined }],
    ["precio sobre el máximo", { precioBase: MAX_PRECIO_BASE + 1 }],
    ["precio con 3 decimales", { precioBase: 10.123 }],
  ])("rechaza %s", (_name, override) => {
    expect(parse({ ...validBody, ...override }).success).toBe(false);
  });

  it.each([
    ["string", "4h"],
    ["cero", 0],
    ["decimal", 1.5],
    ["sobre el máximo", MAX_PRINT_HOURS + 1],
  ])("rechaza tiempoImpresion %s", (_name, value) => {
    const body = {
      ...validBody,
      especificaciones: {
        ...validBody.especificaciones,
        tiempoImpresion: value,
      },
    };
    expect(parse(body).success).toBe(false);
  });

  it("acepta tiempoImpresion en el límite máximo", () => {
    const body = {
      ...validBody,
      especificaciones: {
        ...validBody.especificaciones,
        tiempoImpresion: MAX_PRINT_HOURS,
      },
    };
    expect(parse(body).success).toBe(true);
  });
});

describe("createProductSchema - planos técnicos", () => {
  const plano = {
    titulo: "Plano de engranaje",
    archivoUrl: "https://cdn.test.example/mec3d/modelos/a.pdf",
    precioBase: 500,
    categoria: "Planos técnicos",
    formato: "PDF",
  };

  it("acepta un plano sin tecnologia, materiales ni especificaciones", () => {
    expect(parse(plano).success).toBe(true);
  });

  it.each(["PDF", "DWG", "DXF"])("acepta formato %s", (formato) => {
    const archivoUrl = `https://cdn.test.example/mec3d/modelos/a.${formato.toLowerCase()}`;
    expect(parse({ ...plano, formato, archivoUrl }).success).toBe(true);
  });

  it.each([
    ["sin formato", { formato: undefined }],
    ["formato STL", { formato: "STL" }],
    ["formato en minúsculas", { formato: "pdf" }],
    ["materiales sin tecnologia", { materiales: ["PLA"] }],
  ])("rechaza plano %s", (_name, override) => {
    expect(parse({ ...plano, ...override }).success).toBe(false);
  });

  it("sigue exigiendo tecnologia y materiales en otras categorías", () => {
    const { tecnologia, materiales, ...sinCatalogo } = validBody;
    expect(parse({ ...sinCatalogo, categoria: "Autos" }).success).toBe(false);
    expect(parse({ ...validBody, categoria: "Autos" }).success).toBe(true);
  });

  it.each([
    [
      "extensión que no es de plano",
      { archivoUrl: "https://cdn.test.example/mec3d/modelos/a.stl" },
    ],
    ["extensión distinta del formato", { formato: "DWG" }],
    [
      "sin extensión",
      { archivoUrl: "https://cdn.test.example/mec3d/modelos/a" },
    ],
  ])("rechaza plano con %s", (_name, override) => {
    expect(parse({ ...plano, ...override }).success).toBe(false);
  });

  it("deriva la extensión ignorando query string y mayúsculas", () => {
    const archivoUrl = "https://cdn.test.example/mec3d/modelos/a.PDF?x=1.stl";
    expect(parse({ ...plano, archivoUrl }).success).toBe(true);
  });

  it.each(["pdf", "dwg", "dxf"])(
    "rechaza un archivo .%s fuera de la categoría Planos técnicos",
    (ext) => {
      const archivoUrl = `https://cdn.test.example/mec3d/modelos/a.${ext}`;
      expect(parse({ ...validBody, archivoUrl }).success).toBe(false);
      expect(
        parse({ ...validBody, archivoUrl, categoria: "Autos" }).success,
      ).toBe(false);
    },
  );
});

describe("partialUpdateProductSchema", () => {
  it("permite omitir tecnologia y materiales", () => {
    const result = partialUpdateProductSchema.safeParse({
      body: { titulo: "Nuevo título" },
    });
    expect(result.success).toBe(true);
  });

  it("valida materiales cuando se envían", () => {
    const result = partialUpdateProductSchema.safeParse({
      body: { materiales: [] },
    });
    expect(result.success).toBe(false);
  });
});
