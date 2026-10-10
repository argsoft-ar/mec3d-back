import crypto from "crypto";
import {
  TOLERANCIA_FIRMA_MS,
  verificarFirmaMercadoPago,
} from "../src/utils/mp-signature.util";

const SECRET = "secreto-de-prueba-123456";
const AHORA = 1_900_000_000_000;

function firmar(opts: {
  dataId: string;
  requestId: string;
  ts: number;
  secret?: string;
}) {
  const manifest = `id:${opts.dataId.toLowerCase()};request-id:${opts.requestId};ts:${opts.ts};`;
  const v1 = crypto
    .createHmac("sha256", opts.secret ?? SECRET)
    .update(manifest)
    .digest("hex");
  return `ts=${opts.ts},v1=${v1}`;
}

const verificar = (
  over: Partial<Parameters<typeof verificarFirmaMercadoPago>[0]> = {},
) =>
  verificarFirmaMercadoPago({
    xSignature: firmar({ dataId: "123456", requestId: "req-1", ts: AHORA }),
    xRequestId: "req-1",
    dataId: "123456",
    secret: SECRET,
    ahoraMs: AHORA,
    ...over,
  });

describe("verificarFirmaMercadoPago", () => {
  it("acepta una firma válida", () => {
    expect(verificar()).toEqual({ valida: true });
  });

  it("acepta data.id alfanumérico normalizado a minúsculas", () => {
    const xSignature = firmar({
      dataId: "ABC123",
      requestId: "req-1",
      ts: AHORA,
    });
    expect(verificar({ xSignature, dataId: "ABC123" })).toEqual({
      valida: true,
    });
  });

  it("acepta ts en segundos", () => {
    const ts = Math.floor(AHORA / 1000);
    const xSignature = firmar({ dataId: "123456", requestId: "req-1", ts });
    expect(verificar({ xSignature })).toEqual({ valida: true });
  });

  it("rechaza una firma calculada con otro secreto", () => {
    const xSignature = firmar({
      dataId: "123456",
      requestId: "req-1",
      ts: AHORA,
      secret: "otro-secreto-123456",
    });
    expect(verificar({ xSignature })).toEqual({
      valida: false,
      motivo: "firma_incorrecta",
    });
  });

  it("rechaza si cambia el data.id o el request-id firmados", () => {
    expect(verificar({ dataId: "999999" })).toEqual({
      valida: false,
      motivo: "firma_incorrecta",
    });
    expect(verificar({ xRequestId: "req-2" })).toEqual({
      valida: false,
      motivo: "firma_incorrecta",
    });
  });

  it("rechaza una firma vieja (replay) aunque sea auténtica", () => {
    const ts = AHORA - TOLERANCIA_FIRMA_MS - 1;
    const xSignature = firmar({ dataId: "123456", requestId: "req-1", ts });
    expect(verificar({ xSignature })).toEqual({
      valida: false,
      motivo: "timestamp_vencido",
    });
  });

  it("rechaza una firma con timestamp en el futuro lejano", () => {
    const ts = AHORA + TOLERANCIA_FIRMA_MS + 1;
    const xSignature = firmar({ dataId: "123456", requestId: "req-1", ts });
    expect(verificar({ xSignature })).toEqual({
      valida: false,
      motivo: "timestamp_vencido",
    });
  });

  it("acepta el borde de tolerancia", () => {
    const ts = AHORA - TOLERANCIA_FIRMA_MS;
    const xSignature = firmar({ dataId: "123456", requestId: "req-1", ts });
    expect(verificar({ xSignature })).toEqual({ valida: true });
  });

  it("rechaza headers ausentes o malformados", () => {
    expect(verificar({ xSignature: undefined })).toEqual({
      valida: false,
      motivo: "firma_ausente",
    });
    expect(verificar({ xRequestId: undefined })).toEqual({
      valida: false,
      motivo: "request_id_ausente",
    });
    expect(verificar({ dataId: undefined })).toEqual({
      valida: false,
      motivo: "data_id_ausente",
    });
    for (const xSignature of [
      "",
      "basura",
      "ts=abc,v1=ff",
      `ts=${AHORA}`,
      `ts=${AHORA},v1=zz`,
      `v1=ab12`,
    ]) {
      expect(verificar({ xSignature }).valida).toBe(false);
    }
  });

  it("no lanza con una v1 de longitud distinta (comparación timing-safe con guarda de largo)", () => {
    const resultado = verificar({ xSignature: `ts=${AHORA},v1=abcd` });
    expect(resultado).toEqual({ valida: false, motivo: "firma_incorrecta" });
  });
});
