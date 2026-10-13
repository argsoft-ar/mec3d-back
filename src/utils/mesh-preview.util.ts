import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";

// Formatos con vista previa (STEP/STP no se pueden parsear sin un kernel CAD).
export const EXTENSIONES_PREVIEW = ["stl", "obj", "3mf"] as const;
export type ExtensionPreview = (typeof EXTENSIONES_PREVIEW)[number];

export function esExtensionPreview(
  ext: string | null | undefined,
): ext is ExtensionPreview {
  return (EXTENSIONES_PREVIEW as readonly string[]).includes(ext ?? "");
}

// Triángulos máximos del preview y resolución máxima de la grilla de agrupación: aun con una
// malla chica, la forma sale a lo sumo con 1/MAX_GRID de la caja mayor, nunca la original.
export const PREVIEW_MAX_TRIANGLES = 6000;
// 24 celdas por la caja mayor: la forma sigue reconocible en la UI, pero cada celda (>= ~4% de la caja) borra el detalle que haría imprimible la pieza.
export const PREVIEW_MAX_GRID = 24;
const MAX_GRID = PREVIEW_MAX_GRID;
const MIN_GRID = 2;
// Un triángulo con área menor a esta fracción de celda² se considera degenerado (colineal).
const AREA_MIN_CELDA2 = 1e-3;

// Topes de entrada para acotar memoria y CPU (el worker además corre con timeout y límite de heap).
const MAX_INPUT_TRIANGLES = 1_500_000;
const MAX_INPUT_VERTICES = 1_500_000;
const MAX_3MF_MODEL_BYTES = 24 * 1024 * 1024;
// Se alimenta el zip en trozos chicos: cada trozo se infla de una vez (máx. ~1032:1).
const ZIP_TROZO_BYTES = 16 * 1024;
const MAX_LINEA_OBJ = 16 * 1024;
const MAX_ETIQUETA_XML = 512;

interface Malla {
  vertices: Float32Array; // xyz por vértice
  indices: Uint32Array; // 3 por triángulo
}

function ampliarF32(a: Float32Array, tope: number): Float32Array {
  const n = new Float32Array(Math.min(Math.max(a.length * 2, 3), tope));
  n.set(a);
  return n;
}

function ampliarU32(a: Uint32Array, tope: number): Uint32Array {
  const n = new Uint32Array(Math.min(Math.max(a.length * 2, 3), tope));
  n.set(a);
  return n;
}

// Acumula la malla en typed arrays que crecen por duplicación hasta los topes de entrada.
class MallaBuilder {
  private v: Float32Array;
  private i: Uint32Array;
  private nv = 0;
  private nt = 0;

  constructor(verticesIniciales = 1024, triangulosIniciales = 1024) {
    this.v = new Float32Array(
      Math.min(verticesIniciales, MAX_INPUT_VERTICES) * 3,
    );
    this.i = new Uint32Array(
      Math.min(triangulosIniciales, MAX_INPUT_TRIANGLES) * 3,
    );
  }

  get vertexCount(): number {
    return this.nv;
  }

  addVertex(x: number, y: number, z: number): void {
    // Se valida el valor ya redondeado a float32: 1e39 es finito en double pero no en float32.
    const fx = Math.fround(x);
    const fy = Math.fround(y);
    const fz = Math.fround(z);
    if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(fz)) {
      throw new Error("Malla inválida: coordenada no finita");
    }
    if (this.nv >= MAX_INPUT_VERTICES) {
      throw new Error("Malla demasiado grande");
    }
    if ((this.nv + 1) * 3 > this.v.length) {
      this.v = ampliarF32(this.v, MAX_INPUT_VERTICES * 3);
    }
    const o = this.nv * 3;
    this.v[o] = fx;
    this.v[o + 1] = fy;
    this.v[o + 2] = fz;
    this.nv++;
  }

  addTriangle(a: number, b: number, c: number): void {
    const n = this.nv;
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      !Number.isInteger(c) ||
      a < 0 ||
      b < 0 ||
      c < 0 ||
      a >= n ||
      b >= n ||
      c >= n
    ) {
      throw new Error("Malla inválida: índice fuera de rango");
    }
    if (this.nt >= MAX_INPUT_TRIANGLES) {
      throw new Error("Malla demasiado grande");
    }
    if ((this.nt + 1) * 3 > this.i.length) {
      this.i = ampliarU32(this.i, MAX_INPUT_TRIANGLES * 3);
    }
    const o = this.nt * 3;
    this.i[o] = a;
    this.i[o + 1] = b;
    this.i[o + 2] = c;
    this.nt++;
  }

  // subarray: vistas sobre los buffers ya reservados, sin una segunda copia fuera del heap.
  build(): Malla {
    return {
      vertices: this.v.subarray(0, this.nv * 3),
      indices: this.i.subarray(0, this.nt * 3),
    };
  }
}

// ── Parsers ──────────────────────────────────────────────────────────────────

export function parseStl(buf: Uint8Array): Malla {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const esBinario =
    buf.byteLength >= 84 &&
    buf.byteLength === 84 + 50 * view.getUint32(80, true);
  if (esBinario) {
    const n = view.getUint32(80, true);
    if (n > MAX_INPUT_TRIANGLES) throw new Error("Malla demasiado grande");
    const b = new MallaBuilder(n * 3, n);
    for (let t = 0; t < n; t++) {
      const off = 84 + t * 50 + 12; // salta la normal
      for (let k = 0; k < 3; k++) {
        const p = off + k * 12;
        b.addVertex(
          view.getFloat32(p, true),
          view.getFloat32(p + 4, true),
          view.getFloat32(p + 8, true),
        );
      }
      const base = t * 3;
      b.addTriangle(base, base + 1, base + 2);
    }
    return b.build();
  }

  const texto = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
    .toString("latin1")
    .trimStart();
  if (!/^solid/i.test(texto)) throw new Error("STL inválido");
  const b = new MallaBuilder();
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    b.addVertex(Number(m[1]), Number(m[2]), Number(m[3]));
    count++;
    if (count % 3 === 0) b.addTriangle(count - 3, count - 2, count - 1);
  }
  if (count === 0 || count % 3 !== 0) {
    throw new Error(
      "STL inválido: los vértices no forman triángulos completos",
    );
  }
  return b.build();
}

function indiceObj(token: string, total: number): number {
  const raw = Number.parseInt(token.split("/")[0], 10);
  if (!Number.isFinite(raw) || raw === 0) throw new Error("OBJ inválido");
  return raw > 0 ? raw - 1 : total + raw;
}

export function parseObj(buf: Uint8Array): Malla {
  // latin1: las líneas v/f son ASCII y así el string ocupa 1 byte por carácter.
  const texto = Buffer.from(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength,
  ).toString("latin1");
  const b = new MallaBuilder();
  let pos = 0;
  while (pos < texto.length) {
    let fin = texto.indexOf("\n", pos);
    if (fin === -1) fin = texto.length;
    const esVertice = texto.startsWith("v ", pos);
    if (esVertice || texto.startsWith("f ", pos)) {
      if (fin - pos > MAX_LINEA_OBJ)
        throw new Error("OBJ inválido: línea demasiado larga");
      const p = texto.slice(pos, fin).trim().split(/\s+/);
      if (esVertice) {
        b.addVertex(Number(p[1]), Number(p[2]), Number(p[3]));
      } else if (p.length >= 4) {
        const idx = p.slice(1).map((t) => indiceObj(t, b.vertexCount));
        for (let k = 1; k < idx.length - 1; k++) {
          b.addTriangle(idx[0], idx[k], idx[k + 1]);
        }
      }
    }
    pos = fin + 1;
  }
  return b.build();
}

// Extrae los .model del 3MF con un tope sobre los bytes realmente inflados: el tamaño que
// declara el zip no es confiable (un zip bomb puede mentir), así que se cuenta lo que se produce.
function extraerModelos(buf: Uint8Array): Uint8Array[] {
  const archivos: Uint8Array[][] = [];
  let total = 0;
  let fallo: Error | null = null;

  const unzip = new Unzip();
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  unzip.onfile = (f) => {
    if (!/\.model$/i.test(f.name)) return;
    if ((f.originalSize ?? 0) > MAX_3MF_MODEL_BYTES) {
      fallo = new Error("3MF demasiado grande");
      return;
    }
    const trozos: Uint8Array[] = [];
    archivos.push(trozos);
    f.ondata = (error, chunk) => {
      if (fallo) return;
      if (error) {
        fallo = error;
        return;
      }
      total += chunk.length;
      if (total > MAX_3MF_MODEL_BYTES) {
        fallo = new Error("3MF demasiado grande");
        return;
      }
      trozos.push(chunk);
    };
    f.start();
  };

  for (let o = 0; o < buf.length && !fallo; o += ZIP_TROZO_BYTES) {
    const fin = Math.min(o + ZIP_TROZO_BYTES, buf.length);
    unzip.push(buf.subarray(o, fin), fin === buf.length);
  }
  if (fallo) throw fallo;
  return archivos.map((trozos) => Buffer.concat(trozos));
}

// Atributos requeridos de una etiqueta (comillas dobles o simples); lanza si falta alguno.
// El largo de la etiqueta está acotado: limita el backtracking de la regex.
const ATRIBUTO_RE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function atributosNumericos(tag: string, nombres: readonly string[]): number[] {
  if (tag.length > MAX_ETIQUETA_XML)
    throw new Error("3MF inválido: etiqueta demasiado larga");
  const valores: (string | undefined)[] = new Array(nombres.length);
  ATRIBUTO_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATRIBUTO_RE.exec(tag)) !== null) {
    const i = nombres.indexOf(m[1]);
    if (i >= 0) valores[i] = m[2] ?? m[3];
  }
  return nombres.map((nombre, i) => {
    const valor = valores[i]?.trim();
    if (!valor) throw new Error(`3MF inválido: falta el atributo ${nombre}`);
    return Number(valor);
  });
}

const ATRIBUTOS_VERTICE = ["x", "y", "z"] as const;
const ATRIBUTOS_TRIANGULO = ["v1", "v2", "v3"] as const;

// Recorrido lineal por etiquetas (sin regex sobre el documento completo): una etiqueta sin cierre
// o un '<' suelto no puede provocar backtracking cuadrático.
function leerModelo(xml: string, b: MallaBuilder): void {
  let enMesh = false;
  let offset = 0;
  let i = 0;
  let fin = -1;
  for (;;) {
    i = xml.indexOf("<", i);
    if (i === -1) break;
    if (fin < i) {
      fin = xml.indexOf(">", i);
      if (fin === -1) break;
    }
    const siguiente = xml.indexOf("<", i + 1);
    if (siguiente !== -1 && siguiente < fin) {
      i = siguiente; // '<' suelto: no abre una etiqueta
      continue;
    }

    let n = i + 1;
    if (xml.charCodeAt(n) === 47) n++; // etiqueta de cierre
    while (n < fin && xml.charCodeAt(n) > 32 && xml.charCodeAt(n) !== 47) n++;
    const nombre = xml.slice(i + 1, n);
    if (nombre === "mesh") {
      if (xml.charCodeAt(fin - 1) !== 47) {
        enMesh = true;
        offset = b.vertexCount;
      }
    } else if (nombre === "/mesh") {
      enMesh = false;
    } else if (enMesh && nombre === "vertex") {
      const [x, y, z] = atributosNumericos(
        xml.slice(n, fin),
        ATRIBUTOS_VERTICE,
      );
      b.addVertex(x, y, z);
    } else if (enMesh && nombre === "triangle") {
      const [v1, v2, v3] = atributosNumericos(
        xml.slice(n, fin),
        ATRIBUTOS_TRIANGULO,
      );
      b.addTriangle(offset + v1, offset + v2, offset + v3);
    }
    i = fin + 1;
  }
}

// Concatena todas las mallas del 3MF; ignora transformaciones de build/components.
export function parse3mf(buf: Uint8Array): Malla {
  const b = new MallaBuilder();
  for (const datos of extraerModelos(buf)) {
    leerModelo(
      Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength).toString(
        "latin1",
      ),
      b,
    );
  }
  return b.build();
}

export function parseMalla(buf: Uint8Array, ext: ExtensionPreview): Malla {
  if (ext === "stl") return parseStl(buf);
  if (ext === "obj") return parseObj(buf);
  return parse3mf(buf);
}

// ── Decimación por agrupación de vértices ────────────────────────────────────
// Cada vértice cae en una celda de una grilla uniforme; todos los de la celda se funden en el
// centro de la celda y se descartan los triángulos degenerados o repetidos. La resolución se elige
// como la más fina que cumpla el tope de triángulos (y MAX_GRID). Es irreversible: ningún vértice
// de salida es un punto del original, solo un nodo de la grilla.

interface Cajas {
  min: [number, number, number];
  max: [number, number, number];
  extension: number;
}

function calcularCaja(vertices: Float32Array): Cajas {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = vertices[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const extension = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return { min, max, extension };
}

// Devuelve el cluster de cada vértice original y un vértice por cluster: el CENTRO de su celda
// (nunca un punto de la malla), recortado a la caja original para no inflar el volumen.
function agrupar(
  vertices: Float32Array,
  caja: Cajas,
  grilla: number,
): { clusterDe: Int32Array; vertices: Float32Array } {
  const n = vertices.length / 3;
  const celda = caja.extension / grilla;
  const clusterDe = new Int32Array(n);
  const mapa = new Map<number, number>();
  const indicesCelda: number[] = [];
  const tope = grilla - 1;
  for (let v = 0; v < n; v++) {
    const cx = Math.min(
      tope,
      Math.floor((vertices[v * 3] - caja.min[0]) / celda),
    );
    const cy = Math.min(
      tope,
      Math.floor((vertices[v * 3 + 1] - caja.min[1]) / celda),
    );
    const cz = Math.min(
      tope,
      Math.floor((vertices[v * 3 + 2] - caja.min[2]) / celda),
    );
    const clave = (cx * grilla + cy) * grilla + cz;
    let id = mapa.get(clave);
    if (id === undefined) {
      id = mapa.size;
      mapa.set(clave, id);
      indicesCelda.push(cx, cy, cz);
    }
    clusterDe[v] = id;
  }
  const centros = new Float32Array(mapa.size * 3);
  for (let c = 0; c < mapa.size; c++) {
    for (let k = 0; k < 3; k++) {
      const centro = caja.min[k] + (indicesCelda[c * 3 + k] + 0.5) * celda;
      centros[c * 3 + k] = Math.min(caja.max[k], Math.max(caja.min[k], centro));
    }
  }
  return { clusterDe, vertices: centros };
}

// Cluster distintos y con área no nula (los centros de celda pueden quedar colineales).
function trianguloValido(
  v: Float32Array,
  a: number,
  b: number,
  c: number,
  area2Min: number,
): boolean {
  if (a === b || b === c || a === c) return false;
  const ux = v[b * 3] - v[a * 3];
  const uy = v[b * 3 + 1] - v[a * 3 + 1];
  const uz = v[b * 3 + 2] - v[a * 3 + 2];
  const wx = v[c * 3] - v[a * 3];
  const wy = v[c * 3 + 1] - v[a * 3 + 1];
  const wz = v[c * 3 + 2] - v[a * 3 + 2];
  const nx = uy * wz - uz * wy;
  const ny = uz * wx - ux * wz;
  const nz = ux * wy - uy * wx;
  return nx * nx + ny * ny + nz * nz > area2Min * area2Min;
}

function contarTriangulos(
  indices: Uint32Array,
  clusterDe: Int32Array,
  vertices: Float32Array,
  area2Min: number,
): number {
  let n = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = clusterDe[indices[t]];
    const b = clusterDe[indices[t + 1]];
    const c = clusterDe[indices[t + 2]];
    if (trianguloValido(vertices, a, b, c, area2Min)) n++;
  }
  return n;
}

export function simplificarMalla(
  malla: Malla,
  maxTriangulos: number = PREVIEW_MAX_TRIANGLES,
): Malla {
  if (malla.indices.length === 0)
    throw new Error("La malla no tiene triángulos");
  const caja = calcularCaja(malla.vertices);
  if (!(caja.extension > 0) || !Number.isFinite(caja.extension)) {
    throw new Error("La malla es degenerada");
  }

  // Búsqueda binaria de la grilla más fina que no supere el tope.
  let lo = MIN_GRID;
  let hi = MAX_GRID;
  let mejor = MIN_GRID;
  const area2Min = (grilla: number) => {
    const celda = caja.extension / grilla;
    return AREA_MIN_CELDA2 * celda * celda;
  };
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const { clusterDe, vertices } = agrupar(malla.vertices, caja, mid);
    if (
      contarTriangulos(malla.indices, clusterDe, vertices, area2Min(mid)) <=
      maxTriangulos
    ) {
      mejor = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const { clusterDe, vertices } = agrupar(malla.vertices, caja, mejor);
  const umbral = area2Min(mejor);

  const vistos = new Set<string>();
  const salida = new Uint32Array(maxTriangulos * 3);
  let nSalida = 0;
  for (let t = 0; t < malla.indices.length; t += 3) {
    const a = clusterDe[malla.indices[t]];
    const b = clusterDe[malla.indices[t + 1]];
    const c = clusterDe[malla.indices[t + 2]];
    if (!trianguloValido(vertices, a, b, c, umbral)) continue;
    // Rotación canónica: conserva la orientación y colapsa duplicados.
    const m = Math.min(a, b, c);
    const clave =
      m === a
        ? `${a},${b},${c}`
        : m === b
          ? `${b},${c},${a}`
          : `${c},${a},${b}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.set([a, b, c], nSalida * 3);
    nSalida++;
    if (nSalida >= maxTriangulos) break;
  }
  if (nSalida === 0) throw new Error("La simplificación no dejó triángulos");
  return { vertices, indices: salida.slice(0, nSalida * 3) };
}

// ── Exportación STL binario ──────────────────────────────────────────────────

export function mallaAStlBinario(malla: Malla): Uint8Array {
  const n = malla.indices.length / 3;
  const out = new Uint8Array(84 + n * 50);
  const view = new DataView(out.buffer);
  out.set(Buffer.from("mec3d-preview"), 0);
  view.setUint32(80, n, true);
  const v = malla.vertices;
  for (let t = 0; t < n; t++) {
    const a = malla.indices[t * 3] * 3;
    const b = malla.indices[t * 3 + 1] * 3;
    const c = malla.indices[t * 3 + 2] * 3;
    const ux = v[b] - v[a];
    const uy = v[b + 1] - v[a + 1];
    const uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a];
    const wy = v[c + 1] - v[a + 1];
    const wz = v[c + 2] - v[a + 2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    let off = 84 + t * 50;
    for (const val of [nx, ny, nz]) {
      view.setFloat32(off, val, true);
      off += 4;
    }
    for (const base of [a, b, c]) {
      for (let k = 0; k < 3; k++) {
        view.setFloat32(off, v[base + k], true);
        off += 4;
      }
    }
  }
  return out;
}

// Original (STL/OBJ/3MF) -> STL binario degradado de a lo sumo `maxTriangulos` triángulos.
export function generarPreviewStl(
  datos: Uint8Array,
  ext: ExtensionPreview,
  maxTriangulos: number = PREVIEW_MAX_TRIANGLES,
): Uint8Array {
  return mallaAStlBinario(
    simplificarMalla(parseMalla(datos, ext), maxTriangulos),
  );
}
