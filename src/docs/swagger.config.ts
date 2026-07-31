import swaggerJsdoc from "swagger-jsdoc";
import { userSchemaDoc } from "./schemas/user.schema";
import { productSchemaDoc } from "./schemas/product.schema";
import { errorSchemaDoc } from "./schemas/error.schema";
import { paginationSchemaDoc } from "./schemas/pagination.schema";
import { authPaths } from "./auth.docs";
import { productPaths } from "./product.docs";
import { uploadPaths } from "./upload.docs";

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
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ...userSchemaDoc,
        ...productSchemaDoc,
        ...errorSchemaDoc,
        ...paginationSchemaDoc,
      },
    },
    paths: {
      ...authPaths,
      ...productPaths,
      ...uploadPaths,
    },
  },
  apis: [], // No usamos JSDoc en archivos, todo está definido en este archivo
};

export const swaggerSpec = swaggerJsdoc(options);
