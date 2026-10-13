import dotenv from "dotenv";
// Cargar variables de entorno antes de importar la app
dotenv.config();

import http from "http";
import app from "./app";
import { initChatSocket } from "./sockets/chat.socket";
import {
  validateMercadoPagoEnv,
  validateDeliveryCodeEnv,
  validateSecretsEnv,
} from "./config/env.config";
import { iniciarScheduler } from "./jobs/scheduler";

const PORT = process.env.PORT || 3000;

// En producción el servidor no arranca con secretos débiles/de ejemplo ni sin la configuración
// de Mercado Pago o del código de entrega.
validateSecretsEnv();
validateMercadoPagoEnv();
validateDeliveryCodeEnv();

const httpServer = http.createServer(app);
initChatSocket(httpServer);

const startServer = async () => {
  try {
    // Aquí inicializaremos la conexión a la Base de Datos a futuro (ej. pg pool connect)
    // await db.connect();
    // console.log('✅ Conexión a la base de datos establecida');

    httpServer.listen(PORT, () => {
      console.log(`🚀 Servidor MEC3D ejecutándose en http://localhost:${PORT}`);
      iniciarScheduler();
    });
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();
