import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import router from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';

// Inicializar Express
const app: Application = express();

// Middlewares de seguridad y utilidades
app.use(helmet()); // Protege configurando cabeceras HTTP
app.use(cors()); // Permite peticiones de otros dominios
app.use(express.json()); // Parsea requests entrantes con payloads JSON
app.use(express.urlencoded({ extended: true })); // Parsea payloads URL-encoded

// Rutas base de la API
app.use('/api/v1', router);

// Manejador de ruta no encontrada (404)
app.use(notFoundHandler);

// Manejador de errores global
app.use(errorHandler);

export default app;
