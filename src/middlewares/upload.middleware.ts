import multer from "multer";

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
    cb(new Error("Solo se permiten archivos de imagen (JPEG, PNG, GIF, WebP)"));
  }
};

export const uploadImageMiddleware = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter,
});
