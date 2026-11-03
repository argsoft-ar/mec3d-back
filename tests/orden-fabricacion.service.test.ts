process.env.DELIVERY_CODE_SECRET =
  "secreto-de-codigo-de-entrega-para-tests-0123";

const mockClient = { query: jest.fn() };
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: jest.fn((fn: (c: unknown) => unknown) => fn(mockClient)),
}));
jest.mock("../src/repositories/orden-fabricacion.repository", () => ({
  ordenFabricacionRepository: {
    getById: jest.fn(),
    lockById: jest.fn(),
    aceptarPresupuesto: jest.fn(),
    cancelarHermanas: jest.fn(),
    guardarCodigoEntrega: jest.fn(),
    getFabricantesSugeridos: jest.fn(),
    getDisenoDeOrden: jest.fn(),
    getArchivoParaDescarga: jest.fn(),
    getCerradasPorFabricante: jest.fn(),
    getIdsFabricantesCompatibles: jest.fn(),
    getActivaPorCompradorYFabricante: jest.fn(),
    createOne: jest.fn(),
  },
}));
jest.mock("../src/repositories/compra.repository", () => ({
  compraRepository: {
    getById: jest.fn(),
    lockById: jest.fn(),
    setMontoFabricacion: jest.fn(),
  },
}));
jest.mock("../src/repositories/pago.repository", () => ({
  pagoRepository: {},
}));
jest.mock("../src/repositories/chat.repository", () => ({
  chatRepository: {
    getByOrdenFabricacionId: jest.fn(),
    crearMensaje: jest.fn(),
    createConversacion: jest.fn(),
    marcarLeida: jest.fn(),
  },
}));
jest.mock("../src/services/chat.service", () => ({
  mapMensaje: (m: unknown) => m,
}));
jest.mock("../src/repositories/user.repository", () => ({
  userRepository: { findById: jest.fn(), findFabricanteIds: jest.fn() },
}));
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: { getById: jest.fn(), getByIdWithDesigner: jest.fn() },
}));
jest.mock("../src/services/catalogo.service", () => ({
  catalogoService: {
    getMaterialesDeDiseno: jest.fn(),
    resolverMaterialDeDiseno: jest.fn(),
  },
}));
jest.mock("../src/services/pago.service", () => ({
  pagoService: { iniciarPago: jest.fn() },
}));
jest.mock("../src/services/archivo.service", () => ({
  archivoService: { firmarUrl: jest.fn() },
}));
jest.mock("../src/services/payout.provider", () => ({
  solicitarPayouts: jest.fn(),
}));
jest.mock("../src/sockets/io.instance", () => ({
  getIO: () => ({ to: mockTo }),
}));

import { ordenFabricacionService } from "../src/services/orden-fabricacion.service";
import { ordenFabricacionRepository } from "../src/repositories/orden-fabricacion.repository";
import { compraRepository } from "../src/repositories/compra.repository";
import { chatRepository } from "../src/repositories/chat.repository";
import { userRepository } from "../src/repositories/user.repository";
import { disenoRepository } from "../src/repositories/diseno.repository";
import { catalogoService } from "../src/services/catalogo.service";
import { pagoService } from "../src/services/pago.service";
import { archivoService } from "../src/services/archivo.service";
import { withTransaction } from "../src/utils/transaction.util";

const ordenes = ordenFabricacionRepository as jest.Mocked<
  typeof ordenFabricacionRepository
>;
const compras = compraRepository as jest.Mocked<typeof compraRepository>;
const chat = chatRepository as jest.Mocked<typeof chatRepository>;
const usuarios = userRepository as jest.Mocked<typeof userRepository>;
const disenos = disenoRepository as jest.Mocked<typeof disenoRepository>;
const catalogo = catalogoService as jest.Mocked<typeof catalogoService>;
const pagos = pagoService as jest.Mocked<typeof pagoService>;
const archivos = archivoService as jest.Mocked<typeof archivoService>;
const transaccion = withTransaction as jest.MockedFunction<
  typeof withTransaction
>;

const ORDEN_ID = "1a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRA_ID = "2a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const DISENO_ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FABRICANTE = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const AJENO = "7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const filaOrden = (extra: Record<string, unknown> = {}) => ({
  id: ORDEN_ID,
  compra_id: COMPRA_ID,
  fabricante_id: FABRICANTE,
  id_comprador: COMPRADOR,
  estado: "en_negociacion",
  precio_acordado: null,
  precio_propuesto_comprador: "1200.00",
  precio_propuesto_fabricante: "1500.00",
  cerrado_por_comprador: false,
  cerrado_por_fabricante: false,
  cerrado_en: null,
  creado_en: "2026-01-01",
  compra_estado: "pendiente_pago",
  ...extra,
});

const filaCompra = {
  id: COMPRA_ID,
  id_comprador: COMPRADOR,
  id_modelo: DISENO_ID,
  tipo: "fabricacion",
  estado: "pendiente_pago",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  ordenes.getById.mockResolvedValue(filaOrden());
  ordenes.lockById.mockResolvedValue(filaOrden());
  ordenes.aceptarPresupuesto.mockResolvedValue(
    filaOrden({
      estado: "trato_cerrado",
      precio_acordado: "1500.00",
      cerrado_por_comprador: true,
      cerrado_por_fabricante: true,
      cerrado_en: "2026-01-02",
    }),
  );
  ordenes.cancelarHermanas.mockResolvedValue(2);
  ordenes.guardarCodigoEntrega.mockResolvedValue({ id: ORDEN_ID });
  compras.lockById.mockResolvedValue(filaCompra as never);
  compras.setMontoFabricacion.mockResolvedValue(true as never);
  disenos.getById.mockResolvedValue({ categoria_nombre: "Autos" } as never);
  chat.getByOrdenFabricacionId.mockResolvedValue({ id: "conv-1" } as never);
  chat.crearMensaje.mockImplementation(
    async (data) => ({ id: "msg-1", ...data }) as never,
  );
  pagos.iniciarPago.mockResolvedValue({
    initPoint: "https://mp.example/pay",
  } as never);
});

describe("ordenFabricacionService.crear: notificaciones", () => {
  const FABRICANTE_2 = "8f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

  beforeEach(() => {
    compras.getById.mockResolvedValue({
      ...filaCompra,
      material_id: 3,
    } as never);
    disenos.getById.mockResolvedValue({
      id: DISENO_ID,
      titulo: "<b>Soporte</b>",
      categoria_nombre: "Autos",
      tecnologia_id: 1,
    } as never);
    usuarios.findFabricanteIds.mockResolvedValue([FABRICANTE, FABRICANTE_2]);
    ordenes.getIdsFabricantesCompatibles.mockResolvedValue([
      FABRICANTE,
      FABRICANTE_2,
    ]);
    ordenes.getActivaPorCompradorYFabricante.mockResolvedValue(null);
    ordenes.createOne.mockImplementation(
      async (_compra: string, fabricanteId: string) =>
        filaOrden({
          id: `orden-${fabricanteId}`,
          fabricante_id: fabricanteId,
          estado: "solicitado",
        }) as never,
    );
    chat.getByOrdenFabricacionId.mockResolvedValue(null);
    chat.createConversacion.mockImplementation(
      async (data) => ({ id: `conv-${data.fabricanteId}` }) as never,
    );
    chat.crearMensaje.mockImplementation(
      async (data) =>
        ({
          id: `msg-${data.conversacionId}`,
          conversacion_id: data.conversacionId,
          remitente_id: null,
          contenido: data.contenido,
          tipo: data.tipo,
          creado_en: "2026-01-01",
          comprador_id: COMPRADOR,
          fabricante_id: data.conversacionId.replace("conv-", ""),
          remitente_username: null,
        }) as never,
    );
    usuarios.findById.mockResolvedValue({
      id: COMPRADOR,
      email: "privado@mec3d.com",
      username: "comp",
    } as never);
  });

  it("emite nueva-solicitud-fabricacion a cada fabricante tras el commit, con mensaje de sistema", async () => {
    await ordenFabricacionService.crear(
      COMPRA_ID,
      [FABRICANTE, FABRICANTE_2],
      COMPRADOR,
    );

    // Mensaje de sistema en texto plano, dentro de la transacción; el comprador queda leído.
    expect(chat.crearMensaje).toHaveBeenCalledWith(
      {
        conversacionId: `conv-${FABRICANTE}`,
        remitenteId: null,
        contenido: "Nueva solicitud de fabricación para «Soporte»",
        tipo: "sistema",
      },
      mockClient,
    );
    expect(chat.marcarLeida).toHaveBeenCalledWith(
      `conv-${FABRICANTE}`,
      COMPRADOR,
      mockClient,
    );

    for (const fab of [FABRICANTE, FABRICANTE_2]) {
      expect(mockTo).toHaveBeenCalledWith(`user:${fab}`);
      expect(mockEmit).toHaveBeenCalledWith("nueva-solicitud-fabricacion", {
        ordenId: `orden-${fab}`,
        conversacionId: `conv-${fab}`,
        disenoId: DISENO_ID,
        disenoTitulo: "Soporte",
        compradorUsername: "comp",
      });
    }
    // El comprador no recibe avisos de su propia solicitud.
    expect(mockTo).not.toHaveBeenCalledWith(`user:${COMPRADOR}`);
    expect(
      mockEmit.mock.calls.filter(
        (c) => (c as unknown[])[0] === "notificacion-mensaje",
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(mockEmit.mock.calls)).not.toMatch(/privado@/);

    expect(transaccion).toHaveBeenCalledTimes(1);
    expect(chat.crearMensaje.mock.invocationCallOrder[1]).toBeLessThan(
      mockEmit.mock.invocationCallOrder[0],
    );
  });

  it("si la conversación ya existía no re-notifica ni duplica el mensaje", async () => {
    chat.getByOrdenFabricacionId.mockResolvedValue({ id: "conv-1" } as never);
    await ordenFabricacionService.crear(COMPRA_ID, [FABRICANTE], COMPRADOR);
    expect(chat.crearMensaje).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("ordenFabricacionService.cerrarTrato", () => {
  it("el mensaje de sistema notifica a ambos participantes", async () => {
    chat.crearMensaje.mockImplementation(
      async (data) =>
        ({
          id: "msg-1",
          conversacion_id: "conv-1",
          remitente_id: null,
          contenido: data.contenido,
          tipo: data.tipo,
          creado_en: "2026-01-01",
          comprador_id: COMPRADOR,
          fabricante_id: FABRICANTE,
          remitente_username: null,
        }) as never,
    );
    await ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, COMPRADOR);
    expect(mockTo).toHaveBeenCalledWith(`user:${COMPRADOR}`);
    expect(mockTo).toHaveBeenCalledWith(`user:${FABRICANTE}`);
    expect(mockEmit).toHaveBeenCalledWith(
      "notificacion-mensaje",
      expect.objectContaining({
        conversacionId: "conv-1",
        mensajeId: "msg-1",
        remitenteUsername: null,
        tipo: "sistema",
      }),
    );
  });

  it("el comprador acepta el presupuesto vigente y el trato se cierra en el acto", async () => {
    const res = await ordenFabricacionService.cerrarTrato(
      ORDEN_ID,
      1500,
      COMPRADOR,
    );

    expect(compras.lockById).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    expect(ordenes.lockById).toHaveBeenCalledWith(mockClient, ORDEN_ID);
    expect(compras.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      ordenes.lockById.mock.invocationCallOrder[0],
    );
    expect(ordenes.aceptarPresupuesto).toHaveBeenCalledWith(
      ORDEN_ID,
      "1500.00",
      mockClient,
    );
    expect(compras.setMontoFabricacion).toHaveBeenCalledWith(
      mockClient,
      COMPRA_ID,
      150000,
    );
    expect(ordenes.cancelarHermanas).toHaveBeenCalledWith(
      COMPRA_ID,
      ORDEN_ID,
      mockClient,
    );
    const [ordenCodigo, hash, db] = ordenes.guardarCodigoEntrega.mock.calls[0];
    expect(ordenCodigo).toBe(ORDEN_ID);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(db).toBe(mockClient);

    expect(chat.crearMensaje).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacionId: "conv-1",
        remitenteId: null,
        tipo: "sistema",
      }),
    );
    expect(mockTo).toHaveBeenCalledWith("conv-1");
    expect(mockEmit).toHaveBeenCalledWith(
      "deal-closed",
      expect.objectContaining({
        ordenFabricacionId: ORDEN_ID,
        precioAcordado: 1500,
        pagoRequerido: true,
      }),
    );
    // El aviso sale después del cuerpo de la transacción (post-commit).
    expect(transaccion).toHaveBeenCalledTimes(1);
    expect(
      ordenes.guardarCodigoEntrega.mock.invocationCallOrder[0],
    ).toBeLessThan(chat.crearMensaje.mock.invocationCallOrder[0]);

    expect(pagos.iniciarPago).toHaveBeenCalledWith(COMPRA_ID, COMPRADOR);
    expect(res.pagoRequerido).toBe(true);
    expect(res.initPoint).toBe("https://mp.example/pay");
    expect(res.orden).toMatchObject({
      id: ORDEN_ID,
      estado: "trato_cerrado",
      precioAcordado: 1500,
      compraEstado: "pendiente_pago",
    });
  });

  it("si la preference falla, el trato queda cerrado e initPoint es null", async () => {
    pagos.iniciarPago.mockRejectedValue(new Error("MP caído"));
    const res = await ordenFabricacionService.cerrarTrato(
      ORDEN_ID,
      1500,
      COMPRADOR,
    );
    expect(res.initPoint).toBeNull();
    expect(res.orden.estado).toBe("trato_cerrado");
  });

  it("el fabricante no puede cerrar: 403 sin tocar la base", async () => {
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, FABRICANTE),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Solo el comprador puede aceptar el presupuesto",
    });
    expect(transaccion).not.toHaveBeenCalled();
    expect(ordenes.aceptarPresupuesto).not.toHaveBeenCalled();
  });

  it("un tercero recibe 403", async () => {
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, AJENO),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(transaccion).not.toHaveBeenCalled();
  });

  it("sin presupuesto del fabricante: 409 SIN_PRESUPUESTO", async () => {
    ordenes.lockById.mockResolvedValue(
      filaOrden({ precio_propuesto_fabricante: null }),
    );
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 409, code: "SIN_PRESUPUESTO" });
    expect(ordenes.aceptarPresupuesto).not.toHaveBeenCalled();
    expect(compras.setMontoFabricacion).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("precio distinto al presupuesto vigente: 409 PRESUPUESTO_DESACTUALIZADO", async () => {
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1200, COMPRADOR),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PRESUPUESTO_DESACTUALIZADO",
    });
    expect(ordenes.aceptarPresupuesto).not.toHaveBeenCalled();
    expect(ordenes.cancelarHermanas).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("orden ya cerrada: 409", async () => {
    ordenes.lockById.mockResolvedValue(filaOrden({ estado: "trato_cerrado" }));
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(ordenes.aceptarPresupuesto).not.toHaveBeenCalled();
  });

  it("cambio concurrente del presupuesto (guard atómico sin filas): 409", async () => {
    ordenes.aceptarPresupuesto.mockResolvedValue(null);
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(compras.setMontoFabricacion).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("otra orden de la compra ya cerró (unique violation): 409", async () => {
    ordenes.aceptarPresupuesto.mockRejectedValue({ code: "23505" });
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, COMPRADOR),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Esta compra ya tiene un trato cerrado",
    });
  });

  it("404 si la orden no existe", async () => {
    ordenes.getById.mockResolvedValue(null);
    await expect(
      ordenFabricacionService.cerrarTrato(ORDEN_ID, 1500, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ordenFabricacionService.fabricantesSugeridos: filtro de zonas", () => {
  beforeEach(() => {
    compras.getById.mockResolvedValue(filaCompra as never);
    disenos.getByIdWithDesigner.mockResolvedValue({
      id: DISENO_ID,
      tecnologia_id: 3,
      categoria_nombre: "Autos",
      designer_zona_id: 6007010,
    } as never);
    catalogo.getMaterialesDeDiseno.mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ] as never);
    ordenes.getFabricantesSugeridos.mockResolvedValue([
      {
        id: FABRICANTE,
        zona_id: 6007010,
        georef_localidad_id: "06007010000",
        puntuacion: "4.5",
        tagline: "Impresiones",
        username: "fab",
      },
    ]);
  });

  it("pasa las zonas refinadas al repositorio separando localidades censales y Georef", async () => {
    const res = await ordenFabricacionService.fabricantesSugeridos(
      DISENO_ID,
      COMPRA_ID,
      COMPRADOR,
      2,
      10,
      undefined,
      {
        provincias: ["06", "02"],
        departamentos: ["06007"],
        localidades: ["06007010", "06007010000", "02000010001"],
      },
    );

    expect(ordenes.getFabricantesSugeridos).toHaveBeenCalledWith(
      3,
      [1, 2],
      6007010,
      "06",
      COMPRADOR,
      10,
      10,
      {
        // 06 y 02 contienen localidades/departamentos elegidos; 06007 contiene 06007010.
        provincias: [],
        departamentos: [],
        localidadesCensales: ["06007010", "02000010"],
        localidadesGeoref: ["06007010000", "02000010001"],
      },
    );
    expect(res).toEqual([
      {
        id: FABRICANTE,
        zonaId: 6007010,
        georefLocalidadId: "06007010000",
        puntuacion: 4.5,
        tagline: "Impresiones",
        username: "fab",
      },
    ]);
  });

  it("refinamiento: provincia 06 + departamento 06441 filtra solo por el departamento", async () => {
    await ordenFabricacionService.fabricantesSugeridos(
      DISENO_ID,
      COMPRA_ID,
      COMPRADOR,
      1,
      50,
      undefined,
      { provincias: ["06", "14"], departamentos: ["06441"], localidades: [] },
    );
    expect(ordenes.getFabricantesSugeridos.mock.calls[0][7]).toEqual({
      provincias: ["14"],
      departamentos: ["06441"],
      localidadesCensales: [],
      localidadesGeoref: [],
    });
  });

  it("sin filtros manda arrays vacíos", async () => {
    await ordenFabricacionService.fabricantesSugeridos(
      DISENO_ID,
      COMPRA_ID,
      COMPRADOR,
      1,
      50,
    );
    expect(ordenes.getFabricantesSugeridos.mock.calls[0][7]).toEqual({
      provincias: [],
      departamentos: [],
      localidadesCensales: [],
      localidadesGeoref: [],
    });
  });

  it("403 si la compra no es del usuario", async () => {
    compras.getById.mockResolvedValue({
      ...filaCompra,
      id_comprador: AJENO,
    } as never);
    await expect(
      ordenFabricacionService.fabricantesSugeridos(
        DISENO_ID,
        COMPRA_ID,
        COMPRADOR,
        1,
        50,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(ordenes.getFabricantesSugeridos).not.toHaveBeenCalled();
  });
});

describe("ordenFabricacionService.getDiseno", () => {
  const filaDiseno = (extra: Record<string, unknown> = {}) => ({
    orden_id: ORDEN_ID,
    estado: "en_negociacion",
    fabricante_id: FABRICANTE,
    id_comprador: COMPRADOR,
    compra_estado: "pendiente_pago",
    material_nombre: "PLA",
    diseno_id: DISENO_ID,
    titulo: "Soporte",
    descripcion: "desc",
    imagen_url: "https://img.example/a.png",
    tiene_preview: true,
    formato: "STL",
    peso_gramos: 35,
    especificaciones: { dimensiones: "10x10" },
    categoria_nombre: "Autos",
    tecnologia_nombre: "FDM",
    materiales_nombres: ["PETG", "PLA"],
    // Aunque la fila trajera la key, nunca debe salir en la respuesta.
    archivo_url: "https://r2.example/secreto.stl",
    ...extra,
  });

  it.each([COMPRADOR, FABRICANTE])(
    "participante (%s) obtiene las specs sin archivoUrl",
    async (userId) => {
      ordenes.getDisenoDeOrden.mockResolvedValue(filaDiseno());
      const res = await ordenFabricacionService.getDiseno(ORDEN_ID, userId);
      expect(res).toEqual({
        ordenId: ORDEN_ID,
        estado: "en_negociacion",
        material: "PLA",
        diseno: {
          id: DISENO_ID,
          titulo: "Soporte",
          descripcion: "desc",
          imagenUrl: "https://img.example/a.png",
          previewUrl: `/api/v1/productos/${DISENO_ID}/preview-publico`,
          categoria: "Autos",
          tecnologia: "FDM",
          materiales: ["PETG", "PLA"],
          formato: "STL",
          pesoGramos: 35,
          especificaciones: { dimensiones: "10x10" },
        },
        puedeDescargar: false,
      });
      expect(JSON.stringify(res)).not.toMatch(/archivo|secreto/i);
    },
  );

  it("un no participante recibe 403", async () => {
    ordenes.getDisenoDeOrden.mockResolvedValue(filaDiseno());
    await expect(
      ordenFabricacionService.getDiseno(ORDEN_ID, AJENO),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("404 si la orden no existe", async () => {
    ordenes.getDisenoDeOrden.mockResolvedValue(null);
    await expect(
      ordenFabricacionService.getDiseno(ORDEN_ID, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    ["solicitado", "pendiente_pago", FABRICANTE, false],
    ["en_negociacion", "pendiente_pago", FABRICANTE, false],
    ["trato_cerrado", "pendiente_pago", FABRICANTE, false],
    ["trato_cerrado", "pagada", FABRICANTE, true],
    ["confirmada", "pagada", FABRICANTE, true],
    ["trato_cerrado", "pagada", COMPRADOR, false],
    ["cancelado", "pagada", FABRICANTE, false],
    ["en_disputa", "pagada", FABRICANTE, false],
  ])(
    "estado %s / compra %s / usuario %s → puedeDescargar %s",
    async (estado, compraEstado, userId, esperado) => {
      ordenes.getDisenoDeOrden.mockResolvedValue(
        filaDiseno({ estado, compra_estado: compraEstado }),
      );
      const res = await ordenFabricacionService.getDiseno(ORDEN_ID, userId);
      expect(res.puedeDescargar).toBe(esperado);
    },
  );

  it("plano técnico o sin preview: previewUrl null", async () => {
    ordenes.getDisenoDeOrden.mockResolvedValue(
      filaDiseno({ categoria_nombre: "Planos técnicos" }),
    );
    const plano = await ordenFabricacionService.getDiseno(ORDEN_ID, COMPRADOR);
    expect(plano.diseno.previewUrl).toBeNull();

    ordenes.getDisenoDeOrden.mockResolvedValue(
      filaDiseno({ tiene_preview: false }),
    );
    const sinPreview = await ordenFabricacionService.getDiseno(
      ORDEN_ID,
      COMPRADOR,
    );
    expect(sinPreview.diseno.previewUrl).toBeNull();
  });
});

describe("ordenFabricacionService.getArchivoDescarga", () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    fabricante_id: FABRICANTE,
    estado: "trato_cerrado",
    compra_estado: "pagada",
    archivo_url: "https://r2.example/a.stl",
    ...extra,
  });

  it.each(["solicitado", "en_negociacion", "cancelado", "en_disputa"])(
    "antes del cierre / fuera de la ventana (%s): 409 sin firmar URL",
    async (estado) => {
      ordenes.getArchivoParaDescarga.mockResolvedValue(fila({ estado }));
      await expect(
        ordenFabricacionService.getArchivoDescarga(ORDEN_ID, FABRICANTE),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(archivos.firmarUrl).not.toHaveBeenCalled();
    },
  );

  it("trato cerrado sin pago acreditado: 409", async () => {
    ordenes.getArchivoParaDescarga.mockResolvedValue(
      fila({ compra_estado: "pendiente_pago" }),
    );
    await expect(
      ordenFabricacionService.getArchivoDescarga(ORDEN_ID, FABRICANTE),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(archivos.firmarUrl).not.toHaveBeenCalled();
  });

  it.each([COMPRADOR, AJENO])("%s no es el fabricante: 403", async (userId) => {
    ordenes.getArchivoParaDescarga.mockResolvedValue(fila());
    await expect(
      ordenFabricacionService.getArchivoDescarga(ORDEN_ID, userId),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(archivos.firmarUrl).not.toHaveBeenCalled();
  });

  it("fabricante con trato cerrado y pago acreditado obtiene la URL firmada", async () => {
    ordenes.getArchivoParaDescarga.mockResolvedValue(fila());
    archivos.firmarUrl.mockResolvedValue({
      url: "https://signed.example/a.stl",
      expiresIn: 300,
    } as never);
    await expect(
      ordenFabricacionService.getArchivoDescarga(ORDEN_ID, FABRICANTE),
    ).resolves.toBe("https://signed.example/a.stl");
  });
});

describe("ordenFabricacionService.cerradasFabricante", () => {
  it.each(["comprador", "disenador", "admin"])(
    "rol %s: 403 sin consultar órdenes",
    async (rol) => {
      usuarios.findById.mockResolvedValue({ rol_principal: rol } as never);
      await expect(
        ordenFabricacionService.cerradasFabricante(COMPRADOR, {
          page: 1,
          limit: 12,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(ordenes.getCerradasPorFabricante).not.toHaveBeenCalled();
    },
  );

  it("fabricante: pagina sobre trato_cerrado/confirmada/completado", async () => {
    usuarios.findById.mockResolvedValue({
      rol_principal: "fabricante",
    } as never);
    ordenes.getCerradasPorFabricante.mockResolvedValue({
      rows: [
        {
          id: ORDEN_ID,
          compra_id: COMPRA_ID,
          estado: "trato_cerrado",
          precio_acordado: "1500.00",
          cerrado_en: "2026-01-02",
          actualizado_en: "2026-01-02",
          diseno_id: DISENO_ID,
          diseno_titulo: "Soporte",
          diseno_imagen_url: null,
          comprador_username: "comp",
          material_nombre: "PLA",
          conversacion_id: "conv-1",
        },
      ],
      total: 13,
    });

    const res = await ordenFabricacionService.cerradasFabricante(FABRICANTE, {
      page: 2,
      limit: 12,
    });

    expect(ordenes.getCerradasPorFabricante).toHaveBeenCalledWith(
      FABRICANTE,
      ["trato_cerrado", "confirmada", "completado"],
      12,
      12,
    );
    expect(res.meta).toEqual({ page: 2, limit: 12, total: 13, totalPages: 2 });
    expect(res.data[0]).toEqual({
      id: ORDEN_ID,
      compraId: COMPRA_ID,
      estado: "trato_cerrado",
      disenoId: DISENO_ID,
      disenoTitulo: "Soporte",
      disenoImagenUrl: null,
      compradorUsername: "comp",
      precioAcordado: 1500,
      material: "PLA",
      fechaCierre: "2026-01-02",
      actualizadoEn: "2026-01-02",
      conversacionId: "conv-1",
    });
  });
});
