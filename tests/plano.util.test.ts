import {
  extensionDeArchivoUrl,
  validarArchivoSegunCategoria,
} from "../src/utils/plano.util";

const url = (name: string) => `https://cdn.test.example/mec3d/modelos/${name}`;

describe("extensionDeArchivoUrl", () => {
  it.each([
    [url("uuid-pieza.STL"), "stl"],
    [url("uuid-plano.pdf?X-Amz-Signature=abc.dwg"), "pdf"],
    [url("uuid-plano.dxf#frag.pdf"), "dxf"],
    [url("uuid-pieza%2Estp"), "stp"],
    ["mec3d/modelos/uuid-a.DWG?v=1", "dwg"],
  ])("deriva la extensión de %s", (input, esperada) => {
    expect(extensionDeArchivoUrl(input)).toBe(esperada);
  });

  it("devuelve null si el archivo no tiene extensión", () => {
    expect(extensionDeArchivoUrl(url("sin-extension"))).toBeNull();
    expect(extensionDeArchivoUrl(url("sin-extension?x=a.pdf"))).toBeNull();
  });
});

describe("validarArchivoSegunCategoria", () => {
  it.each([
    ["pdf", "PDF"],
    ["dwg", "DWG"],
    ["dxf", "DXF"],
  ])("plano .%s con formato %s es válido", (ext, formato) => {
    expect(
      validarArchivoSegunCategoria(url(`a.${ext}`), formato, true),
    ).toBeNull();
  });

  it("plano: la extensión debe coincidir con el formato", () => {
    expect(validarArchivoSegunCategoria(url("a.pdf"), "DWG", true)).toMatch(
      /no coincide con el formato/,
    );
  });

  it("plano: rechaza extensiones que no son de plano", () => {
    expect(validarArchivoSegunCategoria(url("a.stl"), "PDF", true)).toMatch(
      /\.pdf, \.dwg o \.dxf/,
    );
    expect(
      validarArchivoSegunCategoria(url("sin-ext"), "PDF", true),
    ).not.toBeNull();
  });

  it.each(["stl", "3mf", "obj", "step", "stp"])(
    "otras categorías aceptan .%s",
    (ext) => {
      expect(
        validarArchivoSegunCategoria(url(`a.${ext}`), "STL", false),
      ).toBeNull();
    },
  );

  it.each(["pdf", "dwg", "dxf"])("otras categorías rechazan .%s", (ext) => {
    expect(validarArchivoSegunCategoria(url(`a.${ext}`), "STL", false)).toMatch(
      /Planos técnicos/,
    );
  });

  it("otras categorías rechazan extensiones desconocidas o ausentes", () => {
    expect(
      validarArchivoSegunCategoria(url("a.zip"), undefined, false),
    ).toMatch(/modelo 3D/);
    expect(
      validarArchivoSegunCategoria(url("sin-ext"), undefined, false),
    ).toMatch(/modelo 3D/);
  });
});
