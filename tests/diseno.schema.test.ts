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
      especificaciones: { ...validBody.especificaciones, tiempoImpresion: value },
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
