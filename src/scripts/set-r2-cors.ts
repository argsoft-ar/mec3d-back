import { PutBucketCorsCommand } from "@aws-sdk/client-s3";
import r2Client from "../config/r2.config";
import { envConfig } from "../config/env.config";

function stripTrailingSlashes(s: string): string {
  let result = s;
  while (result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

// Misma lógica de parseo de orígenes que usa src/app.ts para el middleware de cors()
const allowedOrigins = envConfig.cors.origin
  .split(",")
  .map((o) => stripTrailingSlashes(o.trim()));

async function setR2Cors(): Promise<void> {
  const bucketName = envConfig.r2.bucketName;

  if (!bucketName) {
    throw new Error(
      "R2_BUCKET_NAME no está definido en las variables de entorno.",
    );
  }

  if (allowedOrigins.every((o) => !o)) {
    throw new Error(
      "CORS_ORIGIN no está definido o no contiene orígenes válidos.",
    );
  }

  const command = new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: allowedOrigins,
          AllowedMethods: ["GET", "HEAD"],
          AllowedHeaders: ["*"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });

  await r2Client.send(command);

  console.log(
    `✅ Política CORS aplicada al bucket "${bucketName}" para los orígenes: ${allowedOrigins.join(", ")}`,
  );
  console.log(
    "⚠️  Recordá actualizar CORS_ORIGIN a los dominios de producción reales antes de desplegar, y volver a correr este script — no dejes localhost como único origen permitido en producción.",
  );
}

setR2Cors().catch((error) => {
  console.error(
    "❌ Error al configurar CORS en el bucket de R2. Verificá las credenciales (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT) y R2_BUCKET_NAME en las variables de entorno.",
  );
  console.error(error);
  process.exit(1);
});
