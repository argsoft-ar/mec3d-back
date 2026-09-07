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
  },
  fileFilter,
});

// Extensiones válidas de archivos de diseño 3D
const MODEL_EXTENSIONS = new Set([".stl", ".3mf", ".obj", ".step", ".stp"]);

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
  } else {
    cb(
      new ValidationError(
        "Solo se permiten archivos de modelo 3D (STL, 3MF, OBJ, STEP/STP)",
      ),
    );
  }
};

export const uploadModelMiddleware = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
    files: 1,
    fields: 5,
  },
  fileFilter: modelFileFilter,
});
