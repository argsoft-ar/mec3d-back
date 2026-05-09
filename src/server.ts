import dotenv from 'dotenv';
// Cargar variables de entorno antes de importar la app
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Aquí inicializaremos la conexión a la Base de Datos a futuro (ej. pg pool connect)
    // await db.connect();
    // console.log('✅ Conexión a la base de datos establecida');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor MEC3D ejecutándose en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
