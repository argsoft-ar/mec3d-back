const mockQuery = jest.fn();

jest.mock("../src/config/db.config", () => ({
  __esModule: true,
  default: { query: mockQuery },
}));

import { pagoRepository } from "../src/repositories/pago.repository";

describe("pagoRepository.listarComprasParaReconciliar", () => {
  it("incluye compras canceladas con un intento rechazado (cobro tardío a reembolsar)", async () => {
    mockQuery.mockResolvedValue({ rows: [{ compra_id: "c1" }] });

    const ids = await pagoRepository.listarComprasParaReconciliar(10);

    expect(ids).toEqual(["c1"]);
    const sql = (mockQuery.mock.calls[0][0] as string).replace(/\s+/g, " ");
    expect(sql).toContain(
      "WHERE (c.estado = 'pendiente_pago' OR (c.estado = 'cancelada' AND p.estado = 'rechazado'))",
    );
    expect(sql).toContain("AND p.mp_preference_id IS NOT NULL");
    expect(mockQuery.mock.calls[0][1]).toEqual([10, 3, 2]);
  });
});
