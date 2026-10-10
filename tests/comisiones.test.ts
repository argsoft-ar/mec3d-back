import {
  assertInvarianteDesglose,
  calcularDesgloseDescarga,
  calcularDesgloseFabricacion,
  porcentajeBps,
  ComisionesConfig,
} from "../src/utils/comisiones.util";
import { construirMovimientos } from "../src/utils/ledger.util";
import { centavosAPesos, pesosACentavos, toCentavos } from "../src/utils/money.util";

const CONFIG: ComisionesConfig = { plataformaBps: 1000, regaliaDisenadorBps: 300 };

const monto = (d: { partes: { tipo: string; montoCentavos: number }[] }, tipo: string) =>
  d.partes.find((p) => p.tipo === tipo)?.montoCentavos ?? 0;

describe("porcentajeBps", () => {
  it("redondea hacia abajo con enteros", () => {
    expect(porcentajeBps(10_000, 1000)).toBe(1000);
    expect(porcentajeBps(999, 1000)).toBe(99);
    expect(porcentajeBps(9, 1000)).toBe(0);
  });

  it("no pierde precisión con montos grandes", () => {
    expect(porcentajeBps(1_000_000_000_000, 300)).toBe(30_000_000_000);
  });
});

describe("calcularDesgloseFabricacion", () => {
  it("aplica 10% plataforma, 2,7% diseñador y 87,3% fabricante", () => {
    const d = calcularDesgloseFabricacion(1_000_000, CONFIG); // $10.000,00
    expect(monto(d, "comision_plataforma")).toBe(100_000);
    expect(monto(d, "regalia_disenador")).toBe(27_000);
    expect(monto(d, "pago_fabricante")).toBe(873_000);
  });

  it("el fabricante absorbe el resto de centavos", () => {
    const d = calcularDesgloseFabricacion(1_001, CONFIG);
    // plataforma floor(100,1)=100; ganancia 901; diseñador floor(27,03)=27; fabricante 874
    expect(monto(d, "comision_plataforma")).toBe(100);
    expect(monto(d, "regalia_disenador")).toBe(27);
    expect(monto(d, "pago_fabricante")).toBe(874);
  });

  it("omite partes que redondean a 0 centavos y mantiene la invariante", () => {
    const d = calcularDesgloseFabricacion(5, CONFIG);
    expect(d.partes.map((p) => p.tipo)).toEqual(["pago_fabricante"]);
    expect(monto(d, "pago_fabricante")).toBe(5);

    const uno = calcularDesgloseFabricacion(1, CONFIG);
    expect(uno.partes).toHaveLength(1);
    expect(uno.partes[0].montoCentavos).toBe(1);
  });

  it("la suma de las partes es exactamente el monto para cualquier monto", () => {
    for (let m = 1; m <= 5_000; m++) {
      const d = calcularDesgloseFabricacion(m, CONFIG);
      expect(d.partes.reduce((s, p) => s + p.montoCentavos, 0)).toBe(m);
      expect(d.partes.every((p) => Number.isInteger(p.montoCentavos) && p.montoCentavos > 0)).toBe(true);
    }
    for (const m of [99_999_99, 123_456_789, 1_000_000_000]) {
      const d = calcularDesgloseFabricacion(m, CONFIG);
      expect(d.partes.reduce((s, p) => s + p.montoCentavos, 0)).toBe(m);
    }
  });

  it("respeta porcentajes configurables (0 y 100%)", () => {
    const sinComision = calcularDesgloseFabricacion(1000, { plataformaBps: 0, regaliaDisenadorBps: 0 });
    expect(sinComision.partes).toEqual([
      { tipo: "pago_fabricante", destinatario: "fabricante", montoCentavos: 1000 },
    ]);
    const todoPlataforma = calcularDesgloseFabricacion(1000, { plataformaBps: 10_000, regaliaDisenadorBps: 300 });
    expect(todoPlataforma.partes).toHaveLength(1);
    expect(todoPlataforma.partes[0].tipo).toBe("comision_plataforma");
  });
});

describe("calcularDesgloseDescarga", () => {
  it("aplica 10% plataforma / 90% diseñador", () => {
    const d = calcularDesgloseDescarga(250_000, CONFIG);
    expect(monto(d, "comision_plataforma")).toBe(25_000);
    expect(monto(d, "pago_disenador")).toBe(225_000);
  });

  it("la plataforma redondea hacia abajo y el diseñador recibe el resto", () => {
    const d = calcularDesgloseDescarga(1_005, CONFIG);
    expect(monto(d, "comision_plataforma")).toBe(100);
    expect(monto(d, "pago_disenador")).toBe(905);
  });

  it("mantiene la invariante para cualquier monto", () => {
    for (let m = 1; m <= 5_000; m++) {
      const d = calcularDesgloseDescarga(m, CONFIG);
      expect(d.partes.reduce((s, p) => s + p.montoCentavos, 0)).toBe(m);
    }
  });
});

describe("validaciones", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rechaza el monto inválido %p",
    (m) => {
      expect(() => calcularDesgloseFabricacion(m, CONFIG)).toThrow();
      expect(() => calcularDesgloseDescarga(m, CONFIG)).toThrow();
    },
  );

  it.each([-1, 10_001, 1.5])("rechaza bps inválidos %p", (bps) => {
    expect(() =>
      calcularDesgloseFabricacion(1000, { plataformaBps: bps, regaliaDisenadorBps: 300 }),
    ).toThrow("Configuración de comisiones inválida");
  });

  it("assertInvarianteDesglose detecta sumas que no cierran y partes inválidas", () => {
    expect(() =>
      assertInvarianteDesglose({
        montoCentavos: 100,
        partes: [{ tipo: "comision_plataforma", destinatario: "plataforma", montoCentavos: 99 }],
      }),
    ).toThrow("Invariante violada");
    expect(() =>
      assertInvarianteDesglose({
        montoCentavos: 100,
        partes: [
          { tipo: "comision_plataforma", destinatario: "plataforma", montoCentavos: 100 },
          { tipo: "pago_disenador", destinatario: "disenador", montoCentavos: 0 },
        ],
      }),
    ).toThrow("parte del desglose inválida");
  });
});

describe("construirMovimientos (ledger)", () => {
  const base = {
    pagoId: "pago-1",
    compraId: "compra-1",
    ordenId: null as string | null,
    disenadorId: "disenador-1",
    fabricanteId: null as string | null,
  };

  it("fabricación: retención por el total + desglose que suma el total, todo retenido", () => {
    const movs = construirMovimientos(
      { ...base, ordenId: "orden-1", tipoCompra: "fabricacion", montoCentavos: 1_000_000, fabricanteId: "fab-1" },
      CONFIG,
    );
    const retencion = movs.find((m) => m.tipo === "retencion");
    expect(retencion).toMatchObject({ usuarioId: null, montoCentavos: 1_000_000, estado: "retenido" });
    const desglose = movs.filter((m) => m.tipo !== "retencion");
    expect(desglose.reduce((s, m) => s + m.montoCentavos, 0)).toBe(1_000_000);
    expect(movs.every((m) => m.estado === "retenido")).toBe(true);
    expect(movs.find((m) => m.tipo === "comision_plataforma")?.usuarioId).toBeNull();
    expect(movs.find((m) => m.tipo === "regalia_disenador")?.usuarioId).toBe("disenador-1");
    expect(movs.find((m) => m.tipo === "pago_fabricante")?.usuarioId).toBe("fab-1");
  });

  it("descarga: plataforma + diseñador", () => {
    const movs = construirMovimientos(
      { ...base, tipoCompra: "descarga", montoCentavos: 250_000 },
      CONFIG,
    );
    expect(movs.map((m) => m.tipo).sort()).toEqual(
      ["comision_plataforma", "pago_disenador", "retencion"].sort(),
    );
  });

  it("fabricación sin fabricante es un error", () => {
    expect(() =>
      construirMovimientos({ ...base, tipoCompra: "fabricacion", montoCentavos: 10_000 }, CONFIG),
    ).toThrow("sin fabricante");
  });
});

describe("money.util", () => {
  it("convierte pesos <-> centavos sin errores de punto flotante", () => {
    expect(pesosACentavos(10.1)).toBe(1010);
    expect(pesosACentavos(0.29)).toBe(29);
    expect(pesosACentavos("1500.00")).toBe(150_000);
    expect(pesosACentavos("1500.5")).toBe(150_050);
    expect(centavosAPesos(150_050)).toBe(1500.5);
  });

  it.each([1.005, "1.234", "abc", -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza el monto %p",
    (v) => {
      expect(() => pesosACentavos(v as number | string)).toThrow();
    },
  );

  it("toCentavos normaliza strings de pg y rechaza no enteros", () => {
    expect(toCentavos("12345")).toBe(12_345);
    expect(toCentavos(null)).toBe(0);
    expect(() => toCentavos("1.5")).toThrow();
  });
});
