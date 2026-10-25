process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";

const mockGetByIdWithDesigner = jest.fn();
const mockGetAcceso = jest.fn();
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: {
    ...jest.requireActual("../src/repositories/diseno.repository")
      .disenoRepository,
    getByIdWithDesigner: (...args: unknown[]) =>
      mockGetByIdWithDesigner(...args),
    getAccesoArchivo: (...args: unknown[]) => mockGetAcceso(...args),
  },
}));

import request from "supertest";
import app from "../src/app";

jest.setTimeout(30_000);

const ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const filaPlano = {
  id: ID,
  titulo: "Plano",
  descripcion: null,
  imagen_url: null,
  rating: "0",
  review_count: "0",
  descargas: "0",
  precio_base: "100",
  formato: "PDF",
  especificaciones: null,
  designer_id: "3f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f",
  designer_name: "Ana",
  designer_tagline: null,
  designer_zona_id: null,
  categoria_nombre: "Planos técnicos",
  tecnologia_nombre: null,
  materiales_nombres: null,
};

beforeEach(() => {
  mockGetByIdWithDesigner.mockReset();
  mockGetAcceso.mockReset();
});

describe("GET /api/v1/productos/:id", () => {
  it("es público y devuelve el producto directo, sin archivoUrl", async () => {
    mockGetByIdWithDesigner.mockResolvedValue(filaPlano);
    const res = await request(app).get(`/api/v1/productos/${ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ID,
      title: "Plano",
      categoria: "Planos técnicos",
      tecnologia: null,
      materiales: [],
      designer: { name: "Ana", initials: "AN" },
    });
    expect(res.body).not.toHaveProperty("archivoUrl");
    expect(res.body).not.toHaveProperty("archivo_url");
    expect(res.body).not.toHaveProperty("data");
    expect(mockGetByIdWithDesigner).toHaveBeenCalledWith(ID, {});
  });

  it("404 si no existe o está eliminado", async () => {
    mockGetByIdWithDesigner.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/productos/${ID}`);
    expect(res.status).toBe(404);
  });

  it("400 si el id no es UUID", async () => {
    const res = await request(app).get("/api/v1/productos/no-es-uuid");
    expect(res.status).toBe(400);
    expect(mockGetByIdWithDesigner).not.toHaveBeenCalled();
  });

  it("/mis-disenos no colisiona con /:id (exige token, no 400)", async () => {
    const res = await request(app).get("/api/v1/productos/mis-disenos");
    expect(res.status).toBe(401);
  });

  it("/:id/archivo-preview no colisiona con /:id (exige token)", async () => {
    const res = await request(app).get(
      `/api/v1/productos/${ID}/archivo-preview`,
    );
    expect(res.status).toBe(401);
    expect(mockGetByIdWithDesigner).not.toHaveBeenCalled();
  });
});
