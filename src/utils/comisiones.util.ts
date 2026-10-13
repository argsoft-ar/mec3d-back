export const BPS_BASE = 10_000;

export interface ComisionesConfig {
  // Comisión de plataforma sobre el monto cobrado (compra de diseño y cierre de fabricación).
  plataformaBps: number;
  // Regalía del diseñador sobre la ganancia bruta del fabricante (monto - comisión de plataforma).
  regaliaDisenadorBps: number;
}

export type TipoDesglose =
  | "comision_plataforma"
  | "regalia_disenador"
  | "pago_fabricante"
  | "pago_disenador";

export type DestinatarioDesglose = "plataforma" | "disenador" | "fabricante";

export interface ParteDesglose {
  tipo: TipoDesglose;
  destinatario: DestinatarioDesglose;
  montoCentavos: number;
}

export interface Desglose {
  montoCentavos: number;
  partes: ParteDesglose[];
}

// División entera hacia abajo (BigInt evita cualquier error de punto flotante).
export function porcentajeBps(montoCentavos: number, bps: number): number {
  return Number((BigInt(montoCentavos) * BigInt(bps)) / BigInt(BPS_BASE));
}

function validarConfig(config: ComisionesConfig): void {
  for (const bps of [config.plataformaBps, config.regaliaDisenadorBps]) {
    if (!Number.isInteger(bps) || bps < 0 || bps > BPS_BASE) {
      throw new Error("Configuración de comisiones inválida");
    }
  }
}

function validarMonto(montoCentavos: number): void {
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error(
      "El monto a desglosar debe ser un entero positivo de centavos",
    );
  }
}

// Invariante: la suma de las partes es exactamente el monto cobrado y cada parte es un entero > 0.
export function assertInvarianteDesglose(desglose: Desglose): void {
  let suma = 0;
  for (const parte of desglose.partes) {
    if (
      !Number.isSafeInteger(parte.montoCentavos) ||
      parte.montoCentavos <= 0
    ) {
      throw new Error("Invariante violada: parte del desglose inválida");
    }
    suma += parte.montoCentavos;
  }
  if (suma !== desglose.montoCentavos) {
    throw new Error(
      `Invariante violada: el desglose suma ${suma} y el monto es ${desglose.montoCentavos}`,
    );
  }
}

function construir(montoCentavos: number, partes: ParteDesglose[]): Desglose {
  // Una parte que redondea a 0 centavos no genera movimiento (CHECK monto > 0 en DB).
  const desglose: Desglose = {
    montoCentavos,
    partes: partes.filter((p) => p.montoCentavos > 0),
  };
  assertInvarianteDesglose(desglose);
  return desglose;
}

// Fabricación: plataforma = floor(P * bps); el resto es la ganancia bruta del fabricante,
// de la que el diseñador recibe floor(ganancia * regalía). El fabricante absorbe el resto
// de centavos. Con 10% / 3%: plataforma 10%, diseñador 2,7%, fabricante 87,3% de P.
export function calcularDesgloseFabricacion(
  montoCentavos: number,
  config: ComisionesConfig,
): Desglose {
  validarMonto(montoCentavos);
  validarConfig(config);

  const plataforma = porcentajeBps(montoCentavos, config.plataformaBps);
  const gananciaBruta = montoCentavos - plataforma;
  const disenador = porcentajeBps(gananciaBruta, config.regaliaDisenadorBps);
  const fabricante = gananciaBruta - disenador;

  return construir(montoCentavos, [
    {
      tipo: "comision_plataforma",
      destinatario: "plataforma",
      montoCentavos: plataforma,
    },
    {
      tipo: "regalia_disenador",
      destinatario: "disenador",
      montoCentavos: disenador,
    },
    {
      tipo: "pago_fabricante",
      destinatario: "fabricante",
      montoCentavos: fabricante,
    },
  ]);
}

// Descarga directa: plataforma = floor(P * bps); el diseñador (vendedor principal) recibe el resto.
export function calcularDesgloseDescarga(
  montoCentavos: number,
  config: ComisionesConfig,
): Desglose {
  validarMonto(montoCentavos);
  validarConfig(config);

  const plataforma = porcentajeBps(montoCentavos, config.plataformaBps);
  const disenador = montoCentavos - plataforma;

  return construir(montoCentavos, [
    {
      tipo: "comision_plataforma",
      destinatario: "plataforma",
      montoCentavos: plataforma,
    },
    {
      tipo: "pago_disenador",
      destinatario: "disenador",
      montoCentavos: disenador,
    },
  ]);
}
