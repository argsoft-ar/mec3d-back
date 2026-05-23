"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Cargar variables de entorno antes de importar la app
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    try {
        // Aquí inicializaremos la conexión a la Base de Datos a futuro (ej. pg pool connect)
        // await db.connect();
        // console.log('✅ Conexión a la base de datos establecida');
        app_1.default.listen(PORT, () => {
            console.log(`🚀 Servidor MEC3D ejecutándose en http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Error al iniciar el servidor:', error);
        process.exit(1);
    }
};
startServer();
