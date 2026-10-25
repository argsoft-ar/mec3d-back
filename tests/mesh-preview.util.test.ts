import { Zip, ZipDeflate, zipSync, strToU8 } from "fflate";
import {
  PREVIEW_MAX_GRID,
  PREVIEW_MAX_TRIANGLES,
  generarPreviewStl,
  parse3mf,
  parseObj,
  parseStl,
} from "../src/utils/mesh-preview.util";

// Mallas de ~80k triángulos y un zip de ~50 MB inflados: margen ante máquinas cargadas.
jest.setTimeout(30_000);

// Esfera UV como lista de triángulos [a,b,c] sobre vértices xyz.
function esfera(franjas: number, sectores: number) {
  const v: number[][] = [];
  for (let i = 0; i <= franjas; i++) {
    const phi = (Math.PI * i) / franjas;
    for (let j = 0; j < sectores; j++) {
      const th = (2 * Math.PI * j) / sectores;
      v.push([
        10 * Math.sin(phi) * Math.cos(th),
        10 * Math.cos(phi),
        10 * Math.sin(phi) * Math.sin(th),
      ]);
    }
  }
  const t: number[][] = [];
  for (let i = 0; i < franjas; i++) {
    for (let j = 0; j < sectores; j++) {
      const a = i * sectores + j;
      const b = i * sectores + ((j + 1) % sectores);
      const c = (i + 1) * sectores + j;
      const d = (i + 1) * sectores + ((j + 1) % sectores);
      t.push([a, c, b], [b, c, d]);
    }
  }
  return { v, t };
}

function stlBinario(v: number[][], t: number[][]): Buffer {
  const buf = Buffer.alloc(84 + t.length * 50);
  buf.writeUInt32LE(t.length, 80);
  t.forEach((tri, i) => {
    let off = 84 + i * 50 + 12;
    for (const idx of tri) {
      for (const c of v[idx]) {
        buf.writeFloatLE(c, off);
        off += 4;
      }
    }
  });
  return buf;
}

function objTexto(v: number[][], t: number[][]): Buffer {
  const lineas = [
    ...v.map((p) => `v ${p[0]} ${p[1]} ${p[2]}`),
    ...t.map((tri) => `f ${tri.map((i) => i + 1).join(" ")}`),
  ];
  return Buffer.from(lineas.join("\n"));
}

function mf3(v: number[][], t: number[][]): Uint8Array {
  const xml = `<?xml version="1.0"?><model><resources><object id="1"><mesh>
    <vertices>${v.map((p) => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join("")}</vertices>
    <triangles>${t.map((tri) => `<triangle v1="${tri[0]}" v2="${tri[1]}" v3="${tri[2]}"/>`).join("")}</triangles>
  </mesh></object></resources></model>`;
  return zipSync({ "3D/3dmodel.model": strToU8(xml) });
}

const trisDe = (stl: Uint8Array) => Buffer.from(stl).readUInt32LE(80);

describe("generarPreviewStl", () => {
  const { v, t } = esfera(200, 200); // 79.600 triángulos

  it.each([
    ["stl", () => stlBinario(v, t)],
    ["obj", () => objTexto(v, t)],
    ["3mf", () => mf3(v, t)],
  ] as const)(
    "reduce una malla .%s a <= tope de triángulos y exporta STL binario válido",
    (ext, make) => {
      const salida = generarPreviewStl(make(), ext);

      const n = trisDe(salida);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(PREVIEW_MAX_TRIANGLES);
      expect(n).toBeLessThan(t.length / 10);
      expect(salida.byteLength).toBe(84 + 50 * n);
      // El resultado vuelve a ser un STL parseable.
      expect(parseStl(salida).indices.length / 3).toBe(n);
    },
  );

  it("no reproduce los vértices originales (degradación irreversible)", () => {
    const salida = parseStl(generarPreviewStl(stlBinario(v, t), "stl"));
    const originales = new Set(
      v.map((p) => p.map((c) => Math.fround(c)).join(",")),
    );
    let coincidentes = 0;
    for (let i = 0; i < salida.vertices.length; i += 3) {
      if (
        originales.has(
          `${salida.vertices[i]},${salida.vertices[i + 1]},${salida.vertices[i + 2]}`,
        )
      ) {
        coincidentes++;
      }
    }
    expect(coincidentes / (salida.vertices.length / 3)).toBeLessThan(0.05);
  });

  it("respeta un tope menor y conserva el tamaño global (caja similar)", () => {
    const salida = parseStl(generarPreviewStl(stlBinario(v, t), "stl", 500));
    expect(salida.indices.length / 3).toBeLessThanOrEqual(500);
    const maxY = Math.max(
      ...Array.from(salida.vertices).filter((_, i) => i % 3 === 1),
    );
    expect(maxY).toBeGreaterThan(8);
    expect(maxY).toBeLessThanOrEqual(10.0001);
  });

  it("es determinista: el mismo original da exactamente el mismo preview", () => {
    const a = generarPreviewStl(stlBinario(v, t), "stl");
    const b = generarPreviewStl(stlBinario(v, t), "stl");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("no sale de la caja original", () => {
    const salida = parseStl(generarPreviewStl(stlBinario(v, t), "stl"));
    for (const c of salida.vertices) {
      expect(Math.abs(c)).toBeLessThanOrEqual(10.0001);
    }
  });

  it("acepta STL ASCII", () => {
    const ascii = `solid x
      facet normal 0 0 1 outer loop
        vertex 0 0 0
        vertex 10 0 0
        vertex 0 10 0
      endloop endfacet
      facet normal 0 0 1 outer loop
        vertex 10 0 0
        vertex 10 10 5
        vertex 0 10 0
      endloop endfacet
    endsolid x`;
    expect(
      trisDe(generarPreviewStl(Buffer.from(ascii), "stl")),
    ).toBeGreaterThan(0);
  });

  it("OBJ: triangula quads e interpreta índices negativos y v/vt/vn", () => {
    const obj = Buffer.from(
      "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 4/4/4\nf -4 -3 -2\n",
    );
    expect(parseObj(obj).indices.length / 3).toBe(3);
  });

  it.each([
    ["STL vacío/ruido", Buffer.from("no es un stl"), "stl"],
    ["OBJ sin caras", Buffer.from("v 0 0 0\nv 1 1 1\n"), "obj"],
    [
      "OBJ con índice fuera de rango",
      Buffer.from("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\n"),
      "obj",
    ],
    [
      "OBJ con coordenada NaN",
      Buffer.from("v 0 0 x\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"),
      "obj",
    ],
    ["3MF que no es zip", Buffer.from("PK-falso"), "3mf"],
  ] as const)("falla de forma controlada con %s", (_n, datos, ext) => {
    expect(() => generarPreviewStl(datos, ext)).toThrow();
  });

  it("rechaza una malla degenerada (todos los puntos iguales)", () => {
    const obj = Buffer.from("v 1 1 1\nv 1 1 1\nv 1 1 1\nf 1 2 3\n");
    expect(() => generarPreviewStl(obj, "obj")).toThrow();
  });

  it("OBJ: acepta CRLF y una última línea sin salto", () => {
    const obj = Buffer.from("v 0 0 0\r\nv 1 0 0\r\nv 0 1 0\r\nf 1 2 3");
    expect(parseObj(obj).indices.length / 3).toBe(1);
  });

  it("OBJ: rechaza una línea de cara descomunal", () => {
    const obj = Buffer.from(
      `v 0 0 0\nv 1 0 0\nv 0 1 0\nf ${"1 ".repeat(20_000)}\n`,
    );
    expect(() => parseObj(obj)).toThrow(/demasiado larga/);
  });
});

describe("malla chica (<= tope de triángulos): vértices en el centro de celda", () => {
  const { v, t } = esfera(40, 40); // 3.200 triángulos: el tope no obliga a simplificar
  const salida = parseStl(generarPreviewStl(stlBinario(v, t), "stl"));
  const original = v.map((p) => p.map((c) => Math.fround(c)));
  const min = [0, 1, 2].map((k) => Math.min(...original.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...original.map((p) => p[k])));
  const extension = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const nSalida = salida.vertices.length / 3;

  const centroDeCelda = (c: number, k: number, g: number) => {
    const celda = extension / g;
    const idx = (c - min[k]) / celda - 0.5;
    return Math.abs(idx - Math.round(idx)) < 1e-3;
  };
  const grillaDeSalida = () => {
    for (let g = 2; g <= PREVIEW_MAX_GRID; g++) {
      let todos = true;
      for (let i = 0; i < salida.vertices.length && todos; i++) {
        todos = centroDeCelda(salida.vertices[i], i % 3, g);
      }
      if (todos) return g;
    }
    return null;
  };

  it("ningún vértice de salida coincide con un vértice original", () => {
    const originales = new Set(original.map((p) => p.join(",")));
    let coincidentes = 0;
    for (let i = 0; i < salida.vertices.length; i += 3) {
      if (
        originales.has(
          `${salida.vertices[i]},${salida.vertices[i + 1]},${salida.vertices[i + 2]}`,
        )
      ) {
        coincidentes++;
      }
    }
    expect(nSalida).toBeGreaterThan(0);
    expect(coincidentes).toBe(0);
  });

  it("cada vértice es el centro de una celda de una grilla de a lo sumo PREVIEW_MAX_GRID", () => {
    expect(PREVIEW_MAX_GRID).toBeLessThanOrEqual(32);
    expect(grillaDeSalida()).not.toBeNull();
  });

  it("la caja de salida se desvía a lo sumo media celda por lado", () => {
    const g = grillaDeSalida()!;
    const medioCelda = extension / g / 2;
    for (let k = 0; k < 3; k++) {
      const valores = Array.from(salida.vertices).filter((_, i) => i % 3 === k);
      expect(Math.min(...valores) - min[k]).toBeLessThanOrEqual(
        medioCelda + 1e-3,
      );
      expect(Math.min(...valores) - min[k]).toBeGreaterThanOrEqual(-1e-6);
      expect(max[k] - Math.max(...valores)).toBeLessThanOrEqual(
        medioCelda + 1e-3,
      );
      expect(max[k] - Math.max(...valores)).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("no deja triángulos degenerados (área cero ni vértices repetidos)", () => {
    const p = salida.vertices;
    for (let i = 0; i < salida.indices.length; i += 3) {
      const [a, b, c] = [
        salida.indices[i],
        salida.indices[i + 1],
        salida.indices[i + 2],
      ];
      expect(new Set([a, b, c]).size).toBe(3);
      const u = [0, 1, 2].map((k) => p[b * 3 + k] - p[a * 3 + k]);
      const w = [0, 1, 2].map((k) => p[c * 3 + k] - p[a * 3 + k]);
      const cruz = Math.hypot(
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0],
      );
      expect(cruz).toBeGreaterThan(1e-6);
    }
  });

  it("una malla chata (caja casi plana) tampoco sale de su caja original", () => {
    const obj = Buffer.from(
      "v 0 0 0\nv 10 0 0\nv 10 10 0.2\nv 0 10 0.2\nf 1 2 3\nf 1 3 4\n",
    );
    const chata = parseStl(generarPreviewStl(obj, "obj"));
    for (let i = 0; i < chata.vertices.length; i += 3) {
      expect(chata.vertices[i + 2]).toBeGreaterThanOrEqual(0);
      expect(chata.vertices[i + 2]).toBeLessThanOrEqual(0.2 + 1e-6);
    }
  });
});

describe("valores numéricos inválidos", () => {
  const triObj = (x: string) =>
    Buffer.from(`v ${x} 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n`);
  const triAscii = (x: string) =>
    Buffer.from(
      `solid s\nvertex ${x} 0 0\nvertex 1 0 0\nvertex 0 1 0\nendsolid s`,
    );

  it.each(["NaN", "Infinity", "-Infinity", "1e39", "-1e400"])(
    "OBJ y STL ASCII rechazan la coordenada %s",
    (x) => {
      expect(() => generarPreviewStl(triObj(x), "obj")).toThrow(/no finita/);
      expect(() => generarPreviewStl(triAscii(x), "stl")).toThrow(/no finita/);
      expect(() => parse3mf(zip3mf(modelo3mf(vertice(x, "0", "0"))))).toThrow(
        /no finita/,
      );
    },
  );

  it("STL binario rechaza NaN e Infinity (float32)", () => {
    for (const valor of [NaN, Infinity, -Infinity]) {
      const buf = Buffer.alloc(84 + 50);
      buf.writeUInt32LE(1, 80);
      buf.writeFloatLE(valor, 84 + 12);
      expect(() => parseStl(buf)).toThrow(/no finita/);
    }
  });

  it("acepta valores float32 extremos sin producir coordenadas no finitas en el preview", () => {
    const obj = Buffer.from(
      "v -3e38 0 0\nv 3e38 0 0\nv 0 3e38 3e38\nf 1 2 3\n",
    );
    const salida = parseStl(generarPreviewStl(obj, "obj"));
    for (const c of salida.vertices) expect(Number.isFinite(c)).toBe(true);
  });
});

describe("STL ASCII malformado", () => {
  it.each([
    ["sin vértices", "solid vacio\nendsolid vacio"],
    [
      "vértices que no son múltiplo de 3",
      "solid s\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nvertex 5 5 5\nendsolid s",
    ],
    [
      "vertex con coordenadas faltantes",
      "solid s\nvertex 0 0\nendloop\nvertex 1 0 0\nvertex 0 1 0\nendsolid s",
    ],
    [
      "coordenada no numérica",
      "solid s\nvertex 0 0 x\nvertex 1 0 0\nvertex 0 1 0\nendsolid s",
    ],
  ])("rechaza %s", (_n, texto) => {
    expect(() => parseStl(Buffer.from(texto))).toThrow();
  });
});

// ── 3MF ──────────────────────────────────────────────────────────────────────

const vertice = (x: string, y: string, z: string, q = '"') =>
  `<vertex x=${q}${x}${q} y=${q}${y}${q} z=${q}${z}${q}/>`;

// Triángulo válido (tres vértices) precedido por el vértice de prueba `primero`.
function modelo3mf(
  primero: string,
  triangulos = '<triangle v1="0" v2="1" v3="2"/>',
): string {
  return `<model><resources><object id="1"><mesh><vertices>${primero}${vertice("1", "0", "0")}${vertice("0", "1", "5")}</vertices><triangles>${triangulos}</triangles></mesh></object></resources></model>`;
}

const zip3mf = (xml: string) => zipSync({ "3D/3dmodel.model": strToU8(xml) });

// Parchea el tamaño sin comprimir declarado (cabecera local y directorio central) de un zip de una entrada.
function conTamanoDeclarado(zip: Uint8Array, declarado: number): Uint8Array {
  const out = Uint8Array.from(zip);
  const view = new DataView(out.buffer);
  view.setUint32(22, declarado, true);
  for (let i = out.length - 4; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, declarado, true);
      break;
    }
  }
  return out;
}

describe("parse3mf", () => {
  it("lee una malla válida y acepta comillas simples y dobles", () => {
    for (const q of ['"', "'"]) {
      const malla = parse3mf(zip3mf(modelo3mf(vertice("0", "0", "0", q))));
      expect(malla.vertices.length / 3).toBe(3);
      expect(malla.indices.length / 3).toBe(1);
    }
  });

  it("lee un zip con data descriptors (generado en streaming)", () => {
    const trozos: Uint8Array[] = [];
    const zip = new Zip((_err, chunk) => trozos.push(chunk));
    const entrada = new ZipDeflate("3D/3dmodel.model");
    zip.add(entrada);
    entrada.push(strToU8(modelo3mf(vertice("0", "0", "0"))), true);
    zip.end();
    expect(parse3mf(Buffer.concat(trozos)).indices.length / 3).toBe(1);
  });

  it.each([
    ["x", `<vertex y="0" z="0"/>`],
    ["z", `<vertex x="0" y="0"/>`],
    ["y vacío", `<vertex x="0" y="" z="0"/>`],
  ])("rechaza un vértice sin el atributo %s", (_n, v) => {
    expect(() => parse3mf(zip3mf(modelo3mf(v)))).toThrow(/falta el atributo/);
  });

  it("rechaza un triángulo sin v3", () => {
    const xml = modelo3mf(vertice("0", "0", "0"), '<triangle v1="0" v2="1"/>');
    expect(() => parse3mf(zip3mf(xml))).toThrow(/falta el atributo v3/);
  });

  it.each([
    ["mayor al último vértice", '<triangle v1="0" v2="1" v3="3"/>'],
    ["negativo", '<triangle v1="-1" v2="1" v3="2"/>'],
    ["no entero", '<triangle v1="0.5" v2="1" v3="2"/>'],
  ])("rechaza un índice %s", (_n, tri) => {
    expect(() =>
      parse3mf(zip3mf(modelo3mf(vertice("0", "0", "0"), tri))),
    ).toThrow(/índice fuera de rango/);
  });

  it("los índices de cada mesh son relativos a sus propios vértices", () => {
    const mesh = `<mesh><vertices>${vertice("0", "0", "0")}${vertice("1", "0", "0")}${vertice("0", "1", "0")}</vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh>`;
    const malla = parse3mf(
      zip3mf(
        `<model><resources><object>${mesh}</object><object>${mesh}</object></resources></model>`,
      ),
    );
    expect(Array.from(malla.indices)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("un zip que declara un tamaño enorme se rechaza antes de inflarlo", () => {
    const zip = conTamanoDeclarado(
      zip3mf(modelo3mf(vertice("0", "0", "0"))),
      0x7fffffff,
    );
    expect(() => parse3mf(zip)).toThrow(/demasiado grande/);
  });

  it("un zip bomb que declara un tamaño falso (chico) se corta por los bytes realmente inflados", () => {
    const relleno = " ".repeat(52 * 1024 * 1024); // ~50 KB comprimido
    const bomba = zipSync(
      { "3D/3dmodel.model": strToU8(`<model>${relleno}</model>`) },
      { level: 1 },
    );
    expect(bomba.length).toBeLessThan(1024 * 1024);
    expect(() => parse3mf(conTamanoDeclarado(bomba, 100))).toThrow(
      /demasiado grande/,
    );
  });

  it("etiquetas sin cierre o con '<' sueltos se procesan en tiempo lineal y fallan de forma controlada", () => {
    for (const xml of [
      "<mesh ".repeat(60_000),
      "<mesh><vertex ".repeat(40_000),
      `<mesh>${'<vertex x="1" y="1" '.repeat(30_000)}`,
      `<mesh>${"<".repeat(100_000)}>`,
    ]) {
      expect(() => generarPreviewStl(zip3mf(xml), "3mf")).toThrow();
    }
  });

  it("rechaza una etiqueta de vértice descomunal", () => {
    const xml = modelo3mf(
      `<vertex x="0" y="0" z="0" ${'a="1" '.repeat(200)}/>`,
    );
    expect(() => parse3mf(zip3mf(xml))).toThrow(/etiqueta demasiado larga/);
  });
});
