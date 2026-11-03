import { refinarZonas } from "../src/utils/zona.util";

const z = (
  provincias: string[] = [],
  departamentos: string[] = [],
  localidades: string[] = [],
) => ({ provincias, departamentos, localidades });

describe("refinarZonas", () => {
  it("sin selecciones devuelve arrays vacíos", () => {
    expect(refinarZonas(z())).toEqual(z());
  });

  it("un departamento reemplaza a su provincia", () => {
    expect(refinarZonas(z(["06"], ["06441"]))).toEqual(z([], ["06441"]));
  });

  it("las provincias sin refinar se mantienen (OR): [06,14] + [06441]", () => {
    expect(refinarZonas(z(["06", "14"], ["06441"]))).toEqual(
      z(["14"], ["06441"]),
    );
  });

  it("una localidad censal reemplaza a su departamento y a su provincia", () => {
    expect(refinarZonas(z(["06"], ["06441", "06007"], ["06441030"]))).toEqual(
      z([], ["06007"], ["06441030"]),
    );
  });

  it("una localidad Georef de 11 dígitos también refina departamento y provincia", () => {
    expect(
      refinarZonas(z(["06", "02"], ["06441"], ["06441030000"])),
    ).toEqual(z(["02"], [], ["06441030000"]));
  });

  it("una localidad sin departamento elegido descarta igual su provincia", () => {
    expect(refinarZonas(z(["06", "14"], [], ["14014010"]))).toEqual(
      z(["06"], [], ["14014010"]),
    );
  });

  it("no confunde prefijos de otra provincia (06 vs 60)", () => {
    expect(refinarZonas(z(["60"], ["06441"]))).toEqual(z(["60"], ["06441"]));
  });

  it("no muta la entrada", () => {
    const entrada = z(["06"], ["06441"], ["06441030"]);
    refinarZonas(entrada);
    expect(entrada).toEqual(z(["06"], ["06441"], ["06441030"]));
  });
});
