import dotenv from "dotenv";
// Cargar variables de entorno antes de importar la app
dotenv.config();

import http from "http";
import app from "./app";
import { initChatSocket } from "./sockets/chat.socket";

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);
initChatSocket(httpServer);

const startServer = async () => {
  try {
    // Aquí inicializaremos la conexión a la Base de Datos a futuro (ej. pg pool connect)
    // await db.connect();
    // console.log('✅ Conexión a la base de datos establecida');

    httpServer.listen(PORT, () => {
      console.log(`🚀 Servidor MEC3D ejecutándose en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();
