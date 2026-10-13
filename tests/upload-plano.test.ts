import {
  isPlanoFile,
  validateModelSignature,
  validatePlanoSignature,
} from "../src/middlewares/upload.middleware";

const buf = (s: string | number[]) =>
  Buffer.from(typeof s === "string" ? s : Uint8Array.from(s));

describe("validatePlanoSignature", () => {
  it("PDF: exige %PDF- al inicio", () => {
    expect(validatePlanoSignature(buf("%PDF-1.7\n..."), "a.pdf")).toBe(true);
    expect(validatePlanoSignature(buf("<html>%PDF-"), "a.pdf")).toBe(false);
  });

  it("DWG: exige AC10 al inicio", () => {
    expect(validatePlanoSignature(buf("AC1032\0\0"), "a.dwg")).toBe(true);
    expect(validatePlanoSignature(buf("MZ\x90\0"), "a.dwg")).toBe(false);
  });

  it("DXF: acepta ASCII y binario", () => {
    expect(
      validatePlanoSignature(
        buf("  0\r\nSECTION\r\n  2\r\nHEADER\r\n"),
        "a.dxf",
      ),
    ).toBe(true);
    expect(
      validatePlanoSignature(buf("999\ncomentario\n0\nSECTION\n"), "a.dxf"),
    ).toBe(true);
    expect(
      validatePlanoSignature(buf("AutoCAD Binary DXF\r\n\x1a\0"), "a.dxf"),
    ).toBe(true);
  });

  it("DXF: tolera el BOM UTF-8 al inicio", () => {
    const bom = [0xef, 0xbb, 0xbf];
    const conBom = (s: string) => Buffer.concat([Buffer.from(bom), buf(s)]);
    expect(
      validatePlanoSignature(
        conBom("  0\r\nSECTION\r\n  2\r\nHEADER\r\n"),
        "a.dxf",
      ),
    ).toBe(true);
    expect(
      validatePlanoSignature(conBom("999\ncomentario\n0\nSECTION\n"), "a.dxf"),
    ).toBe(true);
    expect(
      validatePlanoSignature(conBom("AutoCAD Binary DXF\r\n\x1a\0"), "a.dxf"),
    ).toBe(true);
    expect(validatePlanoSignature(conBom("hola mundo"), "a.dxf")).toBe(false);
    expect(validatePlanoSignature(conBom("<html><script>"), "a.dxf")).toBe(
      false,
    );
  });

  it("DXF: rechaza contenido que no es DXF", () => {
    expect(validatePlanoSignature(buf("<html><script>"), "a.dxf")).toBe(false);
    expect(validatePlanoSignature(buf("0\nSECTION\n\0\0"), "a.dxf")).toBe(
      false,
    );
    expect(validatePlanoSignature(buf("hola mundo"), "a.dxf")).toBe(false);
  });

  it("rechaza vacío y extensiones que no son de plano", () => {
    expect(validatePlanoSignature(Buffer.alloc(0), "a.pdf")).toBe(false);
    expect(validatePlanoSignature(buf("%PDF-1.7"), "a.stl")).toBe(false);
  });
});

describe("isPlanoFile / modelos", () => {
  it("distingue planos de modelos por extensión", () => {
    expect(isPlanoFile("A.PDF")).toBe(true);
    expect(isPlanoFile("a.dwg")).toBe(true);
    expect(isPlanoFile("a.stl")).toBe(false);
  });

  it("los modelos no aceptan extensiones de plano", () => {
    expect(validateModelSignature(buf("%PDF-1.7"), "a.pdf")).toBe(false);
  });
});

describe("uploadModelMiddleware: límite por tipo de archivo", () => {
  jest.setTimeout(30_000);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require("express");
  const {
    uploadModelMiddleware,
  } = require("../src/middlewares/upload.middleware");
  const { errorHandler } = require("../src/middlewares/error.middleware");
  let server: import("node:http").Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.post(
      "/up",
      uploadModelMiddleware.single("archivo"),
      (req: any, res: any) => res.json({ size: req.file.size }),
    );
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const subir = (name: string, bytes: number) => {
    const form = new FormData();
    form.append(
      "archivo",
      new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
      name,
    );
    return fetch(`${baseUrl}/up`, { method: "POST", body: form });
  };

  it("corta un plano que supera 5 MB sin esperar al límite de modelos", async () => {
    const res = await subir("a.pdf", 5 * 1024 * 1024 + 1);
    expect(res.status).toBe(400);
  });

  it("acepta un plano de 5 MB y un modelo mayor a 5 MB", async () => {
    expect((await subir("a.pdf", 5 * 1024 * 1024)).status).toBe(200);
    expect((await subir("a.stl", 6 * 1024 * 1024)).status).toBe(200);
  });
});
