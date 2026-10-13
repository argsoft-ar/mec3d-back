process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";
process.env.R2_BUCKET_NAME = "bucket-test";

const mockGetPreviewPublico = jest.fn();
const mockGetAcceso = jest.fn();
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: {
    ...jest.requireActual("../src/repositories/diseno.repository")
      .disenoRepository,
    getPreviewPublico: (...args: unknown[]) => mockGetPreviewPublico(...args),
    getAccesoArchivo: (...args: unknown[]) => mockGetAcceso(...args),
  },
}));

const mockGetSignedUrl = jest.fn();
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

import request from "supertest";
import app from "../src/app";
import { envConfig } from "../src/config/env.config";

jest.setTimeout(30_000);

const ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const PREVIEW_KEY = "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl";
const URL_FIRMADA = "https://r2.test.example/signed?X-Amz-Signature=abc";

beforeEach(() => {
  envConfig.r2.bucketName = "bucket-test";
  mockGetPreviewPublico.mockReset();
  mockGetAcceso.mockReset();
  mockGetSignedUrl.mockReset();
  mockGetSignedUrl.mockResolvedValue(URL_FIRMADA);
});

describe("GET /api/v1/productos/:id/preview-publico", () => {
  it("200 sin token: devuelve { url, expiresIn, format } y firma solo la key del preview", async () => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: PREVIEW_KEY,
      categoria_nombre: "Autos",
      // Aunque el repositorio filtrara campos de más, no deben llegar a la respuesta.
      archivo_url:
        "https://cdn.test.example/mec3d/modelos/original-secreto.stl",
    });

    const res = await request(app).get(
      `/api/v1/productos/${ID}/preview-publico`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      url: URL_FIRMADA,
      expiresIn: 300,
      format: "stl",
    });
    expect(res.headers["cache-control"]).toBe("no-store");

    const comando = mockGetSignedUrl.mock.calls[0][1];
    expect(comando.input).toMatchObject({
      Bucket: "bucket-test",
      Key: PREVIEW_KEY,
      ResponseContentType: "model/stl",
    });
    expect(mockGetSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 300 });

    const crudo = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(crudo).not.toMatch(
      /original-secreto|archivo_url|preview_url|mec3d\/modelos/,
    );
    expect(crudo).not.toContain(PREVIEW_KEY);
  });

  it("no consulta nunca el acceso al archivo original", async () => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: PREVIEW_KEY,
      categoria_nombre: "Autos",
    });
    await request(app).get(`/api/v1/productos/${ID}/preview-publico`);
    expect(mockGetAcceso).not.toHaveBeenCalled();
  });

  it("404 si el diseño no existe o está eliminado", async () => {
    mockGetPreviewPublico.mockResolvedValue(null);
    const res = await request(app).get(
      `/api/v1/productos/${ID}/preview-publico`,
    );
    expect(res.status).toBe(404);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("404 si todavía no tiene preview_url", async () => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: null,
      categoria_nombre: "Autos",
    });
    const res = await request(app).get(
      `/api/v1/productos/${ID}/preview-publico`,
    );
    expect(res.status).toBe(404);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("404 si es un plano técnico, aunque tuviera preview_url", async () => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: PREVIEW_KEY,
      categoria_nombre: "Planos técnicos",
    });
    const res = await request(app).get(
      `/api/v1/productos/${ID}/preview-publico`,
    );
    expect(res.status).toBe(404);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("nunca firma una key que no sea un preview (p. ej. un original)", async () => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: "mec3d/modelos/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f-a.stl",
      categoria_nombre: "Autos",
    });
    const res = await request(app).get(
      `/api/v1/productos/${ID}/preview-publico`,
    );
    expect(res.status).toBe(502);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toMatch(/mec3d\/modelos/);
  });

  it.each([
    "previews/9F1C2D3E-4A5B-4C6D-8E7F-0A1B2C3D4E5F.stl", // mayúsculas
    "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl.exe",
    "previews/../9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl",
    "previews/------------------------------------.stl", // 36 caracteres sin forma de UUID
    "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl\n",
  ])("rechaza la key de preview con formato no estricto: %j", async (clave) => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: clave,
      categoria_nombre: "Autos",
    });
    const res = await request(app).get(
      `/api/v1/productos/${ID}/preview-publico`,
    );
    expect(res.status).toBe(502);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("400 si el id no es UUID", async () => {
    const res = await request(app).get(
      "/api/v1/productos/no-es-uuid/preview-publico",
    );
    expect(res.status).toBe(400);
    expect(mockGetPreviewPublico).not.toHaveBeenCalled();
  });

  it("503 sin filtrar detalles si falla la firma", async () => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: PREVIEW_KEY,
      categoria_nombre: "Autos",
    });
    mockGetSignedUrl.mockRejectedValue(
      new Error("fallo interno " + PREVIEW_KEY),
    );
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const res = await request(app).get(
      `/api/v1/productos/${ID}/preview-publico`,
    );
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain(PREVIEW_KEY);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(PREVIEW_KEY);
    errorSpy.mockRestore();
  });

  it("el endpoint del original sigue exigiendo token", async () => {
    const res = await request(app).get(
      `/api/v1/productos/${ID}/archivo-preview`,
    );
    expect(res.status).toBe(401);
    expect(mockGetAcceso).not.toHaveBeenCalled();
  });

  // Va al final: agota el cupo por IP del limiter (60/min) y no se reinicia entre tests.
  it("429 al superar el máximo de solicitudes por minuto, sin firmar ni consultar más", async () => {
    mockGetPreviewPublico.mockResolvedValue({
      preview_url: PREVIEW_KEY,
      categoria_nombre: "Autos",
    });
    const estados: number[] = [];
    for (let i = 0; i < 70; i++) {
      const res = await request(app).get(
        `/api/v1/productos/${ID}/preview-publico`,
      );
      estados.push(res.status);
      if (res.status === 429) {
        expect(res.body).toEqual({
          error: "Demasiadas solicitudes de vista previa, intente más tarde",
        });
        expect(mockGetSignedUrl).toHaveBeenCalledTimes(estados.length - 1);
        break;
      }
    }
    expect(estados[estados.length - 1]).toBe(429);
    expect(estados.slice(0, -1).every((s) => s !== 429)).toBe(true);
    expect(estados.length).toBeLessThanOrEqual(61);
  });
});
