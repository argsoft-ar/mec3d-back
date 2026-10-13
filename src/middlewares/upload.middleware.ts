import multer from "multer";
import path from "node:path";
import { ValidationError } from "../errors/app-error";

const storage = multer.memoryStorage();

// Magic numbers para tipos de imagen válidos
const IMAGE_SIGNATURES: Record<string, string> = {
  ffd8ff: "image/jpeg", // JPEG
  "89504e47": "image/png", // PNG
  "47494638": "image/gif", // GIF
  "52494646": "image/webp", // WebP (RIFF header)
};

// Validar magic number del buffer
export const validateImageSignature = (buffer: Buffer): boolean => {
  const header = buffer.subarray(0, 4).toString("hex").toLowerCase();
  return Object.keys(IMAGE_SIGNATURES).some((sig) => header.startsWith(sig));
};

// Filtro básico por mimetype (primera capa)
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ValidationError(
        "Solo se permiten archivos de imagen (JPEG, PNG, GIF, WebP)",
      ),
    );
  }
};

export const uploadImageMiddleware = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
    fields: 5,
    fieldSize: 1 * 1024 * 1024, // 1 MB, límite explícito para valores de campos no-archivo
  },
  fileFilter,
});

// Extensiones válidas de archivos de diseño 3D
const MODEL_EXTENSIONS = new Set([".stl", ".3mf", ".obj", ".step", ".stp"]);

// Planos técnicos: comparten el endpoint de modelos, pero con límite de tamaño propio. El
// endpoint no conoce la categoría del diseño, así que el tipo se decide por extensión.
export const PLANO_EXTENSIONS = new Set([".pdf", ".dwg", ".dxf"]);
export const MAX_MODEL_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_PLANO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const isPlanoFile = (originalname: string): boolean =>
  PLANO_EXTENSIONS.has(path.extname(originalname).toLowerCase());

// multer.memoryStorage bufferiza hasta el límite global (30 MB) aunque sea un plano; este
// storage descarta lo recibido y falla apenas se supera el límite del tipo de archivo.
const boundedMemoryStorage: multer.StorageEngine = {
  _handleFile(_req, file, cb) {
    const limit = isPlanoFile(file.originalname)
      ? MAX_PLANO_SIZE_BYTES
      : MAX_MODEL_SIZE_BYTES;
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;

    file.stream.on("data", (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        cb(
          new ValidationError(
            `El archivo excede el tamaño máximo permitido (${limit / (1024 * 1024)} MB)`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on("error", (error) => {
      if (!failed) {
        failed = true;
        cb(error);
      }
    });
    file.stream.on("end", () => {
      if (failed) return;
      const buffer = Buffer.concat(chunks, size);
      cb(null, { buffer, size });
    });
  },
  _removeFile(_req, file, cb) {
    delete (file as { buffer?: Buffer }).buffer;
    cb(null);
  },
};

// Los navegadores/clientes rara vez asignan un mimetype correcto a archivos CAD: octet-stream
// (STL/DWG binarios) y text/plain (DXF/OBJ/STEP) se aceptan porque los clientes los declaran así;
// la validación real es por extensión + firma de contenido (validatePlanoSignature).
const PLANO_MIMES = new Set([
  "application/pdf",
  "application/octet-stream",
  "application/acad",
  "application/x-acad",
  "application/autocad_dwg",
  "application/dwg",
  "application/x-dwg",
  "image/vnd.dwg",
  "image/x-dwg",
  "application/dxf",
  "application/x-dxf",
  "image/vnd.dxf",
  "image/x-dxf",
  "text/plain",
]);

const DXF_BINARY_HEADER = "AutoCAD Binary DXF";
const DXF_SAMPLE_BYTES = 4096;
const UTF8_BOM = [0xef, 0xbb, 0xbf];

const sinBomUtf8 = (buffer: Buffer): Buffer =>
  UTF8_BOM.every((byte, i) => buffer[i] === byte) ? buffer.subarray(3) : buffer;

// PDF: "%PDF-". DWG: "AC10" (AC1012..AC1032). DXF binario: "AutoCAD Binary DXF"; DXF ASCII
// (con o sin BOM UTF-8): texto sin bytes nulos que empieza con un código de grupo numérico y
// contiene "SECTION".
export const validatePlanoSignature = (
  buffer: Buffer,
  originalname: string,
): boolean => {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  switch (path.extname(originalname).toLowerCase()) {
    case ".pdf":
      return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
    case ".dwg":
      return buffer.subarray(0, 4).toString("latin1") === "AC10";
    case ".dxf": {
      const contenido = sinBomUtf8(buffer);
      if (
        contenido.subarray(0, DXF_BINARY_HEADER.length).toString("latin1") ===
        DXF_BINARY_HEADER
      ) {
        return true;
      }
      const sample = contenido.subarray(0, DXF_SAMPLE_BYTES);
      if (sample.includes(0)) {
        return false;
      }
      const text = sample.toString("latin1");
      return /^\s*\d{1,4}[ \t]*\r?\n/.test(text) && text.includes("SECTION");
    }
    default:
      return false;
  }
};

// Magic numbers para los formatos de modelo 3D que sí tienen firma binaria confiable
const MODEL_SIGNATURES: Record<string, string> = {
  "504b0304": "3mf", // 3MF es un ZIP
};

// Marcadores de contenido web/ejecutable disfrazado que nunca deberían aparecer al inicio
// de un STL/OBJ/STEP legítimo (denylist de seguridad, no un allowlist de content-type,
// ya que estos formatos no tienen firma binaria registrada).
const DISGUISED_CONTENT_MARKERS = [
  "<!doctype",
  "<html",
  "<script",
  "<?php",
  "<%",
  "mz", // MZ: cabecera de ejecutables Windows PE/EXE (4D 5A)
  "%pdf",
];

const startsWithDisguisedContent = (buffer: Buffer): boolean => {
  const sample = buffer
    .subarray(0, 200)
    .toString("ascii")
    .trimStart()
    .toLowerCase();
  return DISGUISED_CONTENT_MARKERS.some((marker) => sample.startsWith(marker));
};

// STL/OBJ/STEP no tienen un magic number binario universal (STL ASCII, OBJ y STEP son texto plano),
// por lo que se valida por extensión + mimetype y, cuando es posible, por firma binaria (3MF) o cabecera de texto (STEP).
export const validateModelSignature = (
  buffer: Buffer,
  originalname: string,
): boolean => {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  const ext = path.extname(originalname).toLowerCase();
  if (!MODEL_EXTENSIONS.has(ext)) {
    return false;
  }

  if (ext === ".3mf") {
    const header = buffer.subarray(0, 4).toString("hex").toLowerCase();
    return Object.keys(MODEL_SIGNATURES).some((sig) => header.startsWith(sig));
  }

  if (ext === ".step" || ext === ".stp") {
    const header = buffer.subarray(0, 20).toString("ascii").toUpperCase();
    return header.includes("ISO-10303");
  }

  // STL (ASCII o binario) y OBJ son texto/binario sin firma confiable: se acepta por
  // extensión + mimetype, salvo que el contenido inicial coincida con contenido web/ejecutable disfrazado.
  return !startsWithDisguisedContent(buffer);
};

// Filtro por extensión y mimetype (los navegadores rara vez asignan un mimetype correcto a archivos CAD)
const modelFileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  // octet-stream (STL binario) y text/plain (OBJ/STEP ASCII) se aceptan porque los clientes los
  // declaran así; la validación real es por extensión + firma/cabecera (validateModelSignature).
  const allowedMimes = [
    "application/octet-stream",
    "model/stl",
    "application/sla",
    "application/vnd.ms-pki.stl",
    "model/3mf",
    "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
    "model/obj",
    "text/plain",
    "application/step",
    "model/step",
  ];

  if (MODEL_EXTENSIONS.has(ext) && allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else if (PLANO_EXTENSIONS.has(ext) && PLANO_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ValidationError(
        "Solo se permiten archivos de modelo 3D (STL, 3MF, OBJ, STEP/STP) o planos técnicos (PDF, DWG, DXF)",
      ),
    );
  }
};

// multer aplica un límite fijo por instancia: se usa el mayor (modelos) y el controller
// aplica el de planos (MAX_PLANO_SIZE_BYTES) una vez conocida la extensión.
export const uploadModelMiddleware = multer({
  storage: boundedMemoryStorage,
  limits: {
    fileSize: MAX_MODEL_SIZE_BYTES,
    files: 1,
    fields: 5,
    fieldSize: 1 * 1024 * 1024, // 1 MB, límite explícito para valores de campos no-archivo
  },
  fileFilter: modelFileFilter,
});
