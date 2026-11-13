// POST /compras/:id/pagar: el monto de una descarga pendiente se re-fija al precio actual del
// diseño y no se puede pagar un diseño dado de baja (antes se pagaba el monto viejo guardado).
const mockClient = { query: jest.fn() };

jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: jest.fn((fn: (c: unknown) => unknown) => fn(mockClient)),
}));
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: { getById: jest.fn(), lockById: jest.fn() },
}));
jest.mock("../src/repositories/compra.repository", () => ({
  compraRepository: {
    lockById: jest.fn(),
    setMontoDescargaPendiente: jest.fn(),
  },
}));
jest.mock("../src/services/catalogo.service", () => ({ catalogoService: {} }));
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

const COMPRA_ID = "1a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const DISENO_ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const OTRO = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const compraPendiente = (over: Record<string, unknown> = {}) => ({
  id: COMPRA_ID,
  id_comprador: COMPRADOR,
  id_modelo: DISENO_ID,
  tipo: "descarga",
  estado: "pendiente_pago",
  monto_centavos: "100", // creada cuando el diseño costaba $1
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  compras.lockById.mockResolvedValue(compraPendiente() as never);
  compras.setMontoDescargaPendiente.mockResolvedValue({} as never);
  diseno.getById.mockResolvedValue({
    id: DISENO_ID,
    precio_base: "100.00", // el diseñador subió el precio a $100
    eliminado_en: null,
  });
  pagos.iniciarPago.mockResolvedValue({
    pagoId: "p1",
    initPoint: "https://mp.example/pay",
  });
});

describe("compraService.pagar (descarga pendiente)", () => {
  it("re-fija el monto al precio actual ANTES de crear la preference", async () => {
    await expect(
      compraService.pagar(COMPRA_ID, COMPRADOR),
    ).resolves.toMatchObject({ initPoint: "https://mp.example/pay" });

    expect(compras.lockById).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    expect(diseno.getById).toHaveBeenCalledWith(DISENO_ID, mockClient);
    expect(compras.setMontoDescargaPendiente).toHaveBeenCalledWith(
      mockClient,
      COMPRA_ID,
      10000,
    );
    expect(
      compras.setMontoDescargaPendiente.mock.invocationCallOrder[0],
    ).toBeLessThan(pagos.iniciarPago.mock.invocationCallOrder[0]);
  });

  it("no reescribe el monto si ya coincide con el precio actual", async () => {
    compras.lockById.mockResolvedValue(
      compraPendiente({ monto_centavos: "10000" }) as never,
    );
    await compraService.pagar(COMPRA_ID, COMPRADOR);
    expect(compras.setMontoDescargaPendiente).not.toHaveBeenCalled();
    expect(pagos.iniciarPago).toHaveBeenCalledWith(COMPRA_ID, COMPRADOR);
  });

  it("diseño dado de baja: 404 y no inicia el pago", async () => {
    diseno.getById.mockResolvedValue({
      id: DISENO_ID,
      precio_base: "1.00",
      eliminado_en: new Date(),
    });
    await expect(
      compraService.pagar(COMPRA_ID, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(pagos.iniciarPago).not.toHaveBeenCalled();
  });

  it("compra de otro usuario: 403 sin tocar el monto ni iniciar el pago", async () => {
    await expect(compraService.pagar(COMPRA_ID, OTRO)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(compras.setMontoDescargaPendiente).not.toHaveBeenCalled();
    expect(pagos.iniciarPago).not.toHaveBeenCalled();
  });

  it("compra inexistente: 404", async () => {
    compras.lockById.mockResolvedValue(null);
    await expect(
      compraService.pagar(COMPRA_ID, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(pagos.iniciarPago).not.toHaveBeenCalled();
  });

  it("fabricación: no toca el monto (lo fija el trato) y delega en iniciarPago", async () => {
    compras.lockById.mockResolvedValue(
      compraPendiente({ tipo: "fabricacion" }) as never,
    );
    await compraService.pagar(COMPRA_ID, COMPRADOR);
    expect(diseno.getById).not.toHaveBeenCalled();
    expect(compras.setMontoDescargaPendiente).not.toHaveBeenCalled();
    expect(pagos.iniciarPago).toHaveBeenCalledWith(COMPRA_ID, COMPRADOR);
  });
});