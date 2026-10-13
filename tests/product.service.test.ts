const mockClient = { query: jest.fn() };

jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: jest.fn((fn: (c: unknown) => unknown) => fn(mockClient)),
}));
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: {
    getById: jest.fn(),
    lockById: jest.fn(),
    createProduct: jest.fn(),
    updateProduct: jest.fn(),
    partialUpdateProduct: jest.fn(),
    getByIdWithDesigner: jest.fn(),
    deleteProduct: jest.fn(),
    clearPreviewUrl: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("../src/repositories/compra.repository", () => ({
  compraRepository: { existeFabricacionEnCurso: jest.fn() },
}));
jest.mock("../src/repositories/orden-fabricacion.repository", () => ({
  ordenFabricacionRepository: { existeActivaPorDiseno: jest.fn() },
}));
jest.mock("../src/repositories/upload.repository", () => ({
  uploadRepository: { getPropietario: jest.fn() },
}));
jest.mock("../src/services/catalogo.service", () => ({
  catalogoService: {
    resolverCategoria: jest.fn(),
    resolverTecnologia: jest.fn(),
    resolverMateriales: jest.fn(),
    getMaterialesDeDiseno: jest.fn(),
  },
}));
jest.mock("../src/services/archivo.service", () => ({ archivoService: {} }));
jest.mock("../src/services/preview.service", () => ({
  previewService: {
    programar: jest.fn().mockResolvedValue(undefined),
    descartar: jest.fn().mockResolvedValue(undefined),
  },
}));

import { productService } from "../src/services/product.service";
import { previewService } from "../src/services/preview.service";
import { disenoRepository } from "../src/repositories/diseno.repository";
import { compraRepository } from "../src/repositories/compra.repository";
import { ordenFabricacionRepository } from "../src/repositories/orden-fabricacion.repository";
import { catalogoService } from "../src/services/catalogo.service";
import { withTransaction } from "../src/utils/transaction.util";

const diseno = disenoRepository as jest.Mocked<typeof disenoRepository>;
const compras = compraRepository as jest.Mocked<typeof compraRepository>;
const ordenes = ordenFabricacionRepository as jest.Mocked<
  typeof ordenFabricacionRepository
>;
const catalogo = catalogoService as jest.Mocked<typeof catalogoService>;
const mockWithTransaction = withTransaction as jest.Mock;

const USER = "3f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const base = "https://cdn.test.example/mec3d/modelos";
const PLANOS = { id: 7, nombre: "Planos técnicos" };
const AUTOS = { id: 1, nombre: "Autos" };

const existenteModelo = {
  id: ID,
  disenador_id: USER,
  categoria_nombre: "Autos",
  tecnologia_id: 1,
  archivo_url: `${base}/a.stl`,
  imagen_url: null,
  formato: "STL",
};

const dtoModelo = {
  titulo: "Pieza",
  archivoUrl: `${base}/a.stl`,
  precioBase: 100,
  formato: "STL",
  categoria: "Autos",
  tecnologia: "Impresión 3D",
  materiales: ["PLA"],
};

beforeEach(() => {
  jest.clearAllMocks();
  diseno.getById.mockResolvedValue(existenteModelo);
  diseno.lockById.mockResolvedValue(existenteModelo);
  diseno.getByIdWithDesigner.mockResolvedValue({ id: ID });
  diseno.createProduct.mockResolvedValue({ id: ID });
  diseno.updateProduct.mockResolvedValue({ id: ID });
  diseno.partialUpdateProduct.mockResolvedValue({ id: ID });
  compras.existeFabricacionEnCurso.mockResolvedValue(false);
  ordenes.existeActivaPorDiseno.mockResolvedValue(false);
  catalogo.resolverCategoria.mockResolvedValue(AUTOS);
  catalogo.resolverTecnologia.mockResolvedValue({
    id: 1,
    nombre: "Impresión 3D",
  });
  catalogo.resolverMateriales.mockResolvedValue([
    { id: 1, nombre: "PLA", tecnologia_id: 1 },
  ]);
  catalogo.getMaterialesDeDiseno.mockResolvedValue([
    { id: 1, nombre: "PLA", tecnologia_id: 1 },
  ]);
});

describe("productService: coherencia archivoUrl / categoría / formato", () => {
  it("create rechaza un .pdf en una categoría que no es plano", async () => {
    await expect(
      productService.create(
        { ...dtoModelo, archivoUrl: `${base}/a.pdf` },
        USER,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(diseno.createProduct).not.toHaveBeenCalled();
  });

  it("create rechaza un plano cuya extensión no coincide con el formato", async () => {
    catalogo.resolverCategoria.mockResolvedValue(PLANOS);
    await expect(
      productService.create(
        {
          titulo: "Plano",
          archivoUrl: `${base}/a.pdf?x=1`,
          precioBase: 100,
          formato: "DWG",
          categoria: "Planos técnicos",
        },
        USER,
      ),
    ).rejects.toThrow(/no coincide con el formato/);
    expect(diseno.createProduct).not.toHaveBeenCalled();
  });

  it("create acepta un plano .PDF con formato PDF", async () => {
    catalogo.resolverCategoria.mockResolvedValue(PLANOS);
    await productService.create(
      {
        titulo: "Plano",
        archivoUrl: `${base}/a.PDF`,
        precioBase: 100,
        formato: "PDF",
        categoria: "Planos técnicos",
      },
      USER,
    );
    expect(diseno.createProduct).toHaveBeenCalledTimes(1);
  });

  it("update rechaza un modelo .stl declarado como plano", async () => {
    catalogo.resolverCategoria.mockResolvedValue(PLANOS);
    await expect(
      productService.update(
        ID,
        { ...dtoModelo, categoria: "Planos técnicos", formato: "PDF" },
        USER,
      ),
    ).rejects.toThrow(/\.pdf, \.dwg o \.dxf/);
    expect(diseno.updateProduct).not.toHaveBeenCalled();
  });

  it("partialUpdate valida el estado resultante: archivo plano en categoría de modelo", async () => {
    await expect(
      productService.partialUpdate(ID, { archivoUrl: `${base}/a.dxf` }, USER),
    ).rejects.toThrow(/Planos técnicos/);
    expect(diseno.partialUpdateProduct).not.toHaveBeenCalled();
  });

  it("partialUpdate: pasar a plano con el archivo .stl actual falla", async () => {
    catalogo.resolverCategoria.mockResolvedValue(PLANOS);
    await expect(
      productService.partialUpdate(
        ID,
        { categoria: "Planos técnicos", formato: "PDF" },
        USER,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("productService: cambio a Planos técnicos con fabricación en curso", () => {
  const aPlano = {
    categoria: "Planos técnicos",
    formato: "PDF",
    archivoUrl: `${base}/p.pdf`,
  };

  beforeEach(() => {
    catalogo.resolverCategoria.mockResolvedValue(PLANOS);
  });

  it("partialUpdate: 409 si hay una compra de fabricación en curso", async () => {
    compras.existeFabricacionEnCurso.mockResolvedValue(true);
    await expect(
      productService.partialUpdate(ID, aPlano, USER),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(diseno.lockById).toHaveBeenCalledWith(mockClient, ID);
    expect(diseno.partialUpdateProduct).not.toHaveBeenCalled();
  });

  it("partialUpdate: 409 si hay una orden de fabricación activa", async () => {
    ordenes.existeActivaPorDiseno.mockResolvedValue(true);
    await expect(
      productService.partialUpdate(ID, aPlano, USER),
    ).rejects.toThrow(/fabricación en curso/);
    expect(diseno.partialUpdateProduct).not.toHaveBeenCalled();
  });

  it("partialUpdate: sin fabricación toma el lock y escribe en la misma transacción", async () => {
    await productService.partialUpdate(ID, aPlano, USER);
    expect(diseno.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      diseno.partialUpdateProduct.mock.invocationCallOrder[0],
    );
    expect(compras.existeFabricacionEnCurso).toHaveBeenCalledWith(
      ID,
      mockClient,
    );
    expect(diseno.partialUpdateProduct).toHaveBeenCalledWith(
      ID,
      USER,
      expect.objectContaining({ categoriaId: 7 }),
      undefined,
      mockClient,
    );
  });

  it("update (PUT): 409 si hay fabricación en curso", async () => {
    compras.existeFabricacionEnCurso.mockResolvedValue(true);
    await expect(
      productService.update(
        ID,
        {
          titulo: "Plano",
          archivoUrl: `${base}/p.pdf`,
          precioBase: 100,
          formato: "PDF",
          categoria: "Planos técnicos",
        },
        USER,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(diseno.updateProduct).not.toHaveBeenCalled();
  });

  it("un plano que sigue siendo plano no toma el lock ni abre transacción", async () => {
    diseno.getById.mockResolvedValue({
      ...existenteModelo,
      categoria_nombre: "Planos técnicos",
      formato: "PDF",
      archivo_url: `${base}/p.pdf`,
    });
    await productService.partialUpdate(ID, { titulo: "Nuevo título" }, USER);
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(diseno.lockById).not.toHaveBeenCalled();
    expect(diseno.partialUpdateProduct).toHaveBeenCalledTimes(1);
  });

  it("un cambio a categoría de modelo no toma el lock", async () => {
    catalogo.resolverCategoria.mockResolvedValue(AUTOS);
    await productService.partialUpdate(ID, { categoria: "Autos" }, USER);
    expect(diseno.lockById).not.toHaveBeenCalled();
  });
});

describe("productService: generación del preview 3D", () => {
  const preview = previewService as jest.Mocked<typeof previewService>;

  it("create programa el preview de un modelo 3D sin esperarlo", async () => {
    await productService.create(dtoModelo, USER);
    expect(preview.programar).toHaveBeenCalledWith(
      ID,
      dtoModelo.archivoUrl,
      USER,
    );
  });

  it("create no programa preview para planos técnicos", async () => {
    catalogo.resolverCategoria.mockResolvedValue(PLANOS);
    await productService.create(
      {
        titulo: "Plano",
        archivoUrl: `${base}/a.pdf`,
        precioBase: 100,
        formato: "PDF",
        categoria: "Planos técnicos",
      },
      USER,
    );
    expect(preview.programar).not.toHaveBeenCalled();
  });

  it("update con archivo nuevo descarta el preview viejo (leído en la transacción) y regenera", async () => {
    diseno.getById.mockResolvedValue({
      ...existenteModelo,
      preview_url: "previews/leido-antes.stl",
    });
    diseno.updateProduct.mockResolvedValue({
      id: ID,
      preview_url_anterior: "previews/viejo.stl",
    });
    const nuevo = `${base}/b.stl`;
    await productService.update(ID, { ...dtoModelo, archivoUrl: nuevo }, USER);
    expect(preview.descartar).toHaveBeenCalledWith("previews/viejo.stl");
    expect(preview.descartar).not.toHaveBeenCalledWith(
      "previews/leido-antes.stl",
    );
    expect(preview.programar).toHaveBeenCalledWith(ID, nuevo, USER);
  });

  it("update con el mismo archivo y preview existente no regenera", async () => {
    diseno.getById.mockResolvedValue({
      ...existenteModelo,
      preview_url: "previews/ok.stl",
    });
    await productService.update(ID, dtoModelo, USER);
    expect(preview.descartar).not.toHaveBeenCalled();
    expect(preview.programar).not.toHaveBeenCalled();
  });

  it("update con el mismo archivo y preview_url NULL NO reencola (evita amplificación; lo recupera el backfill)", async () => {
    diseno.getById.mockResolvedValue({ ...existenteModelo, preview_url: null });
    await productService.update(ID, dtoModelo, USER);
    await productService.update(ID, dtoModelo, USER);
    expect(preview.programar).not.toHaveBeenCalled();
  });

  it("partialUpdate con preview_url NULL que no toca el archivo no reencola", async () => {
    diseno.getById.mockResolvedValue({ ...existenteModelo, preview_url: null });
    await productService.partialUpdate(ID, { titulo: "Otro" }, USER);
    await productService.partialUpdate(
      ID,
      { archivoUrl: existenteModelo.archivo_url },
      USER,
    );
    expect(preview.programar).not.toHaveBeenCalled();
  });

  it("partialUpdate que no toca el archivo no regenera si ya hay preview", async () => {
    diseno.getById.mockResolvedValue({
      ...existenteModelo,
      preview_url: "previews/ok.stl",
    });
    await productService.partialUpdate(ID, { titulo: "Otro" }, USER);
    expect(preview.programar).not.toHaveBeenCalled();
  });

  it("partialUpdate con archivo nuevo regenera", async () => {
    const nuevo = `${base}/c.stl`;
    await productService.partialUpdate(ID, { archivoUrl: nuevo }, USER);
    expect(preview.programar).toHaveBeenCalledWith(ID, nuevo, USER);
  });

  describe("borrado del preview", () => {
    const KEY = "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl";
    const conPreview = { ...existenteModelo, preview_url: KEY };
    const flush = () => new Promise((r) => setImmediate(r));

    it("al eliminar el diseño limpia y borra el preview devuelto por el RETURNING del soft-delete", async () => {
      // El valor leído antes (getById) puede estar desactualizado: manda el RETURNING.
      diseno.getById.mockResolvedValue({
        ...existenteModelo,
        preview_url: "previews/leido-antes.stl",
      });
      diseno.deleteProduct.mockResolvedValue({ id: ID, preview_url: KEY });
      await productService.delete(ID, USER);
      await flush();
      expect(diseno.clearPreviewUrl).toHaveBeenCalledWith(ID, KEY);
      expect(preview.descartar).toHaveBeenCalledWith(KEY);
      expect(preview.descartar).not.toHaveBeenCalledWith(
        "previews/leido-antes.stl",
      );
    });

    it("eliminar un diseño sin preview no toca R2", async () => {
      diseno.getById.mockResolvedValue({
        ...existenteModelo,
        preview_url: null,
      });
      diseno.deleteProduct.mockResolvedValue({ id: ID, preview_url: null });
      await productService.delete(ID, USER);
      await flush();
      expect(diseno.clearPreviewUrl).not.toHaveBeenCalled();
      expect(preview.descartar).not.toHaveBeenCalled();
    });

    it("si falla la limpieza, la eliminación igual termina bien", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      diseno.getById.mockResolvedValue(conPreview);
      diseno.deleteProduct.mockResolvedValue({ id: ID, preview_url: KEY });
      diseno.clearPreviewUrl.mockRejectedValueOnce(new Error("db caída"));
      await expect(productService.delete(ID, USER)).resolves.toBeUndefined();
      await flush();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("partialUpdate que pasa a plano descarta el preview y no encola otro", async () => {
      catalogo.resolverCategoria.mockResolvedValue(PLANOS);
      diseno.getById.mockResolvedValue(conPreview);
      diseno.partialUpdateProduct.mockResolvedValue({
        id: ID,
        preview_url_anterior: KEY,
      });
      await productService.partialUpdate(
        ID,
        {
          categoria: "Planos técnicos",
          formato: "PDF",
          archivoUrl: `${base}/p.pdf`,
        },
        USER,
      );
      await flush();
      expect(diseno.clearPreviewUrl).toHaveBeenCalledWith(ID, KEY);
      expect(preview.descartar).toHaveBeenCalledWith(KEY);
      expect(preview.programar).not.toHaveBeenCalled();
    });

    it("update (PUT) que pasa a plano descarta el preview y no encola otro", async () => {
      catalogo.resolverCategoria.mockResolvedValue(PLANOS);
      diseno.getById.mockResolvedValue(conPreview);
      diseno.updateProduct.mockResolvedValue({
        id: ID,
        preview_url_anterior: KEY,
      });
      await productService.update(
        ID,
        {
          titulo: "Plano",
          archivoUrl: `${base}/p.pdf`,
          precioBase: 100,
          formato: "PDF",
          categoria: "Planos técnicos",
        },
        USER,
      );
      await flush();
      expect(diseno.clearPreviewUrl).toHaveBeenCalledWith(ID, KEY);
      expect(preview.descartar).toHaveBeenCalledWith(KEY);
      expect(preview.programar).not.toHaveBeenCalled();
    });

    it("si falla la limpieza al pasar a plano, la actualización igual termina bien", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      catalogo.resolverCategoria.mockResolvedValue(PLANOS);
      diseno.getById.mockResolvedValue(conPreview);
      diseno.partialUpdateProduct.mockResolvedValue({
        id: ID,
        preview_url_anterior: KEY,
      });
      diseno.clearPreviewUrl.mockRejectedValueOnce(new Error("db caída"));
      await expect(
        productService.partialUpdate(
          ID,
          {
            categoria: "Planos técnicos",
            formato: "PDF",
            archivoUrl: `${base}/p.pdf`,
          },
          USER,
        ),
      ).resolves.toBeDefined();
      await flush();
      errorSpy.mockRestore();
    });
  });
});
