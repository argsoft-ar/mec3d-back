import swaggerJsdoc from "swagger-jsdoc";
import { userSchemaDoc } from "./schemas/user.schema";
import { productSchemaDoc } from "./schemas/product.schema";
import { errorSchemaDoc } from "./schemas/error.schema";
import { paginationSchemaDoc } from "./schemas/pagination.schema";
import { authPaths } from "./auth.docs";
import { productPaths } from "./product.docs";
import { uploadPaths } from "./upload.docs";
import { catalogoPaths } from "./catalogo.docs";
import { pagoPaths, pagoSchemaDoc } from "./pago.docs";
import {
  ordenFabricacionPaths,
  ordenFabricacionSchemaDoc,
} from "./orden-fabricacion.docs";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MEC3D API",
      version: "1.0.0",
      description: "API para la plataforma de diseños 3D MEC3D",
      contact: {
        name: "Soporte MEC3D",
        email: "soporte@mec3d.com",
      },
    },
    servers: [
      {
        url: "/api/v1",
        description: "API v1",
      },
    ],
    components: {
      securitySchemes: {
        // Sesión en cookie HttpOnly emitida por /auth/login, /auth/registro y PATCH /usuarios/rol.
        // Las requests que modifican estado además exigen un Origin permitido (CSRF).
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "mec3d_session",
        },
      },
      schemas: {
        ...userSchemaDoc,
        ...productSchemaDoc,
        ...errorSchemaDoc,
        ...paginationSchemaDoc,
        ...pagoSchemaDoc,
        ...ordenFabricacionSchemaDoc,
      },
    },
    paths: {
      ...authPaths,
      ...productPaths,
      ...uploadPaths,
      ...catalogoPaths,
      ...pagoPaths,
      ...ordenFabricacionPaths,
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
