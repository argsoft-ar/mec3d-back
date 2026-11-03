const mockClient = { query: jest.fn() };

jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: jest.fn((fn: (c: unknown) => unknown) => fn(mockClient)),
}));
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: { getById: jest.fn(), lockById: jest.fn() },
}));
jest.mock("../src/repositories/compra.repository", () => ({
  compraRepository: {
    create: jest.fn(),
    lockCompraDescarga: jest.fn(),
    getCompraDescargaExistente: jest.fn(),
  },
}));
jest.mock("../src/services/catalogo.service", () => ({
  catalogoService: { resolverMaterialDeDiseno: jest.fn() },
}));
jest.mock("../src/services/pago.service", () => ({
  pagoService: { iniciarPago: jest.fn() },
}));
jest.mock("../src/services/archivo.service", () => ({ archivoService: {} }));

import { compraService } from "../src/services/compra.service";
import { disenoRepository } from "../src/repositories/diseno.repository";
import { compraRepository } from "../src/repositories/compra.repository";
import { pagoService } from "../src/services/pago.service";

const diseno = disenoRepository as jest.Mocked<typeof disenoRepository>;
const compras = compraRepository as jest.Mocked<typeof compraRepository>;
const pagos = pagoService as jest.Mocked<typeof pagoService>;

const DISENO_ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const DISENADOR = "3f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const filaDiseno = {
  id: DISENO_ID,
  disenador_id: DISENADOR,
  precio_base: 100,
  eliminado_en: null,
  categoria_nombre: "Autos",
};

const filaCompra = (tipo: string) => ({
  id: "c1",
  id_comprador: COMPRADOR,
  id_modelo: DISENO_ID,
  id_disenador: DISENADOR,
  tipo,
  estado: "pendiente_pago",
  monto_centavos: null,
  fecha: "2026-01-01",
});

beforeEach(() => {
  jest.clearAllMocks();
  diseno.getById.mockResolvedValue(filaDiseno);
  diseno.lockById.mockResolvedValue(filaDiseno);
  compras.create.mockImplementation(
    async (data) => filaCompra(data.tipo) as never,
  );
  compras.lockCompraDescarga.mockResolvedValue(undefined);
  compras.getCompraDescargaExistente.mockResolvedValue(null);
  pagos.iniciarPago.mockResolvedValue({
    initPoint: "https://mp.example/pay",
  } as never);
});

describe("compraService.crear: serialización con el cambio de categoría", () => {
  it("fabricación: bloquea el diseño y hace el INSERT en la misma transacción", async () => {
    const res = await compraService.crear(DISENO_ID, COMPRADOR, "fabricacion");

    expect(diseno.lockById).toHaveBeenCalledWith(mockClient, DISENO_ID);
    expect(diseno.getById).not.toHaveBeenCalled();
    expect(compras.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "fabricacion", montoCentavos: null }),
      mockClient,
    );
    expect(diseno.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      compras.create.mock.invocationCallOrder[0],
    );
    expect(res.initPoint).toBeNull();
  });

  it("fabricación sobre un plano (lectura con lock) responde 400 y no crea la compra", async () => {
    diseno.lockById.mockResolvedValue({
      ...filaDiseno,
      categoria_nombre: "Planos técnicos",
    });
    await expect(
      compraService.crear(DISENO_ID, COMPRADOR, "fabricacion"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(compras.create).not.toHaveBeenCalled();
  });

  it("fabricación sobre un diseño inexistente responde 404", async () => {
    diseno.lockById.mockResolvedValue(null);
    await expect(
      compraService.crear(DISENO_ID, COMPRADOR, "fabricacion"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("descarga: lee el diseño sin lock y paga fuera de la transacción", async () => {
    const res = await compraService.crear(DISENO_ID, COMPRADOR, "descarga");

    expect(diseno.lockById).not.toHaveBeenCalled();
    expect(diseno.getById).toHaveBeenCalledWith(DISENO_ID, mockClient);
    expect(compras.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "descarga", montoCentavos: 10000 }),
      mockClient,
    );
    expect(pagos.iniciarPago).toHaveBeenCalledWith("c1", COMPRADOR);
    expect(res.initPoint).toBe("https://mp.example/pay");
  });
});

describe("compraService.crear: descargas duplicadas", () => {
  const existente = (estado: string) => ({
    ...filaCompra("descarga"),
    id: "previa",
    estado,
    monto_centavos: "10000",
  });

  it("sin compra previa: toma el lock, crea la compra e inicia el pago", async () => {
    const res = await compraService.crear(DISENO_ID, COMPRADOR, "descarga");

    expect(compras.lockCompraDescarga).toHaveBeenCalledWith(
      mockClient,
      COMPRADOR,
      DISENO_ID,
    );
    expect(compras.getCompraDescargaExistente).toHaveBeenCalledWith(
      COMPRADOR,
      DISENO_ID,
      mockClient,
    );
    expect(compras.lockCompraDescarga.mock.invocationCallOrder[0]).toBeLessThan(
      compras.getCompraDescargaExistente.mock.invocationCallOrder[0],
    );
    expect(compras.create).toHaveBeenCalledTimes(1);
    expect(pagos.iniciarPago).toHaveBeenCalledWith("c1", COMPRADOR);
    expect(res.compra.id).toBe("c1");
  });

  it.each(["pagada", "completada"])(
    "ya %s: 409 COMPRA_DUPLICADA sin crear ni iniciar pago",
    async (estado) => {
      compras.getCompraDescargaExistente.mockResolvedValue(
        existente(estado) as never,
      );
      await expect(
        compraService.crear(DISENO_ID, COMPRADOR, "descarga"),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "COMPRA_DUPLICADA",
        message: "Ya compraste este diseño",
      });
      expect(compras.create).not.toHaveBeenCalled();
      expect(pagos.iniciarPago).not.toHaveBeenCalled();
    },
  );

  it("pendiente_pago: reutiliza la compra y reinicia el pago", async () => {
    compras.getCompraDescargaExistente.mockResolvedValue(
      existente("pendiente_pago") as never,
    );
    const res = await compraService.crear(DISENO_ID, COMPRADOR, "descarga");

    expect(compras.create).not.toHaveBeenCalled();
    expect(pagos.iniciarPago).toHaveBeenCalledWith("previa", COMPRADOR);
    expect(res).toMatchObject({
      compra: { id: "previa", estado: "pendiente_pago", montoCentavos: 10000 },
      initPoint: "https://mp.example/pay",
    });
  });

  it("violación del índice único (23505) se traduce a 409 COMPRA_DUPLICADA", async () => {
    compras.create.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );
    await expect(
      compraService.crear(DISENO_ID, COMPRADOR, "descarga"),
    ).rejects.toMatchObject({ statusCode: 409, code: "COMPRA_DUPLICADA" });
  });

  it("fabricación no consulta descargas previas", async () => {
    await compraService.crear(DISENO_ID, COMPRADOR, "fabricacion");
    expect(compras.lockCompraDescarga).not.toHaveBeenCalled();
    expect(compras.getCompraDescargaExistente).not.toHaveBeenCalled();
  });
});

describe("compraService.estadoDescarga", () => {
  it("sin compra activa", async () => {
    await expect(
      compraService.estadoDescarga(DISENO_ID, COMPRADOR),
    ).resolves.toEqual({ comprado: false, compraId: null, estado: null });
  });

  it.each([
    ["pendiente_pago", false],
    ["pagada", true],
    ["completada", true],
  ])("estado %s -> comprado %s", async (estado, comprado) => {
    compras.getCompraDescargaExistente.mockResolvedValue({
      ...filaCompra("descarga"),
      estado,
    } as never);
    await expect(
      compraService.estadoDescarga(DISENO_ID, COMPRADOR),
    ).resolves.toEqual({ comprado, compraId: "c1", estado });
    expect(compras.getCompraDescargaExistente).toHaveBeenCalledWith(
      COMPRADOR,
      DISENO_ID,
    );
  });
});
