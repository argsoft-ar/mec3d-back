import multer from 'multer';

// Usamos memoryStorage para no guardar el archivo físico en el servidor.
// El archivo quedará temporalmente en la memoria RAM (buffer) 
// para poder enviarlo directamente a Cloudinary o AWS.
const storage = multer.memoryStorage();

// Filtro opcional: solo aceptar imágenes por ahora
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen'));
  }
};

export const uploadImageMiddleware = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Límite de 5 MB
  },
  fileFilter
});
