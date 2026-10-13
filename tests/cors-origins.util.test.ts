import { validarOrigenesCorsProduccion } from "../src/utils/cors-origins.util";

describe("validarOrigenesCorsProduccion", () => {
  it("en producción acepta orígenes https reales", () => {
    expect(() =>
      validarOrigenesCorsProduccion(
        ["https://app.mec3d.com", "https://www.mec3d.com:8443"],
        "production",
      ),
    ).not.toThrow();
  });

  it.each([
    ["comodín", "*"],
    ["http://", "http://app.mec3d.com"],
    ["localhost", "https://localhost:5173"],
    ["localhost http", "http://localhost:5173"],
    ["127.0.0.1", "https://127.0.0.1"],
    ["::1", "https://[::1]:3000"],
    ["no es una URL", "app.mec3d.com"],
  ])("en producción rechaza %s", (_nombre, origen) => {
    expect(() =>
      validarOrigenesCorsProduccion(
        ["https://app.mec3d.com", origen],
        "production",
      ),
    ).toThrow(/CORS_ORIGIN inválido para producción/);
  });

  it("informa todos los orígenes inválidos", () => {
    expect(() =>
      validarOrigenesCorsProduccion(["*", "http://x.com"], "production"),
    ).toThrow(/\*.*http:\/\/x\.com/);
  });

  it.each(["development", "test", undefined])(
    "fuera de producción (%s) no valida",
    (env) => {
      expect(() =>
        validarOrigenesCorsProduccion(["*", "http://localhost:5173"], env),
      ).not.toThrow();
    },
  );
});
