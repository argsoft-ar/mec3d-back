import {
  billeteraQuerySchema,
  marcarPayoutPagadoSchema,
  payoutsPendientesQuerySchema,
  webhookNotificationSchema,
  webhookQuerySchema,
} from "../src/schemas/pago.schema";
import { crearCompraSchema } from "../src/schemas/compra.schema";
import {
  cerrarTratoBodySchema,
  crearOrdenesFabricacionSchema,
  fabricantesSugeridosSchema,
  proponerPrecioBodySchema,
} from "../src/schemas/orden-fabricacion.schema";

const UUID = "3f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

describe("billeteraQuerySchema", () => {
  it("aplica defaults de paginación y transforma a número", () => {
    const r = billeteraQuerySchema.parse({ query: {} });
    expect(r.query).toEqual({ page: 1, limit: 12 });
    expect(
      billeteraQuerySchema.parse({
        query: { page: "2", limit: "50", estado: "pagado" },
      }).query,
    ).toEqual({
      page: 2,
      limit: 50,
      estado: "pagado",
    });
  });

  it.each([
    { estado: "reembolsado" },
    { estado: "liberado" },
    { page: "0" },
    { limit: "101" },
    { page: "abc" },
  ])("rechaza %p", (query) => {
    expect(billeteraQuerySchema.safeParse({ query }).success).toBe(false);
  });
});

describe("payoutsPendientesQuerySchema", () => {
  it("usa la paginación común", () => {
    expect(
      payoutsPendientesQuerySchema.parse({ query: { page: "3" } }).query,
    ).toEqual({ page: 3, limit: 12 });
    expect(
      payoutsPendientesQuerySchema.safeParse({ query: { limit: "0" } }).success,
    ).toBe(false);
  });
});

describe("marcarPayoutPagadoSchema", () => {
  it("exige una referencia no vacía y la recorta", () => {
    expect(
      marcarPayoutPagadoSchema.parse({ body: { referencia: "  CBU-123  " } })
        .body.referencia,
    ).toBe("CBU-123");
  });

  it.each([
    {},
    { referencia: "" },
    { referencia: "   " },
    { referencia: "x".repeat(256) },
    { referencia: 5 },
  ])("rechaza %p", (body) => {
    expect(marcarPayoutPagadoSchema.safeParse({ body }).success).toBe(false);
  });
});

describe("schemas de webhook", () => {
  it("la notificación acepta id/data.id numéricos o string y conserva campos extra", () => {
    const r = webhookNotificationSchema.parse({
      id: 123,
      type: "payment",
      action: "payment.updated",
      data: { id: 987 },
      live_mode: true,
    });
    expect(r).toMatchObject({
      id: 123,
      type: "payment",
      data: { id: 987 },
      live_mode: true,
    });
    expect(
      webhookNotificationSchema.safeParse({ data: { id: "abc" } }).success,
    ).toBe(true);
  });

  it("rechaza tipos incorrectos", () => {
    expect(webhookNotificationSchema.safeParse({ type: 5 }).success).toBe(
      false,
    );
    expect(
      webhookNotificationSchema.safeParse({ data: { id: { x: 1 } } }).success,
    ).toBe(false);
    expect(
      webhookQuerySchema.safeParse({ "data.id": ["a", "b"] }).success,
    ).toBe(false);
  });

  it("la query lee data.id como clave literal", () => {
    expect(
      webhookQuerySchema.parse({ "data.id": "123", type: "payment" }),
    ).toMatchObject({
      "data.id": "123",
      type: "payment",
    });
  });
});

describe("crearCompraSchema", () => {
  it("acepta descarga y fabricación (con material)", () => {
    expect(
      crearCompraSchema.safeParse({
        body: { disenoId: UUID, tipo: "descarga" },
      }).success,
    ).toBe(true);
    expect(
      crearCompraSchema.safeParse({
        body: { disenoId: UUID, tipo: "fabricacion", material: "PLA" },
      }).success,
    ).toBe(true);
  });

  it("rechaza tipo ausente/inválido, uuid inválido y material en descarga", () => {
    expect(
      crearCompraSchema.safeParse({ body: { disenoId: UUID } }).success,
    ).toBe(false);
    expect(
      crearCompraSchema.safeParse({ body: { disenoId: UUID, tipo: "regalo" } })
        .success,
    ).toBe(false);
    expect(
      crearCompraSchema.safeParse({
        body: { disenoId: "no-uuid", tipo: "descarga" },
      }).success,
    ).toBe(false);
    expect(
      crearCompraSchema.safeParse({
        body: { disenoId: UUID, tipo: "descarga", material: "PLA" },
      }).success,
    ).toBe(false);
  });

  it("no deja pasar un monto enviado por el cliente (strip)", () => {
    const r = crearCompraSchema.parse({
      body: { disenoId: UUID, tipo: "descarga", montoCentavos: 1 },
    });
    expect(r.body).not.toHaveProperty("montoCentavos");
  });
});

describe("schemas de orden de fabricación", () => {
  it.each([proponerPrecioBodySchema, cerrarTratoBodySchema])(
    "precio válido e inválido",
    (schema) => {
      expect(schema.safeParse({ body: { precio: 1500.5 } }).success).toBe(true);
      for (const precio of [0, -1, 10.001, 10_000_001, "100", Number.NaN]) {
        expect(schema.safeParse({ body: { precio } }).success).toBe(false);
      }
    },
  );

  it("crear órdenes exige compraId, colapsa duplicados y limita la cantidad", () => {
    expect(
      crearOrdenesFabricacionSchema.safeParse({
        body: { compraId: UUID, fabricanteIds: [UUID] },
      }).success,
    ).toBe(true);
    const dedup = crearOrdenesFabricacionSchema.parse({
      body: { compraId: UUID, fabricanteIds: [UUID, UUID] },
    });
    expect(dedup.body.fabricanteIds).toEqual([UUID]);
    expect(
      crearOrdenesFabricacionSchema.safeParse({
        body: { compraId: UUID, fabricanteIds: [] },
      }).success,
    ).toBe(false);
  });

  it("fabricantes sugeridos exige compraId", () => {
    expect(
      fabricantesSugeridosSchema.safeParse({
        query: { disenoId: UUID, compraId: UUID },
      }).success,
    ).toBe(true);
    expect(
      fabricantesSugeridosSchema.safeParse({ query: { disenoId: UUID } })
        .success,
    ).toBe(false);
  });
});
