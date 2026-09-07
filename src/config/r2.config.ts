import { S3Client } from "@aws-sdk/client-s3";
import { envConfig } from "./env.config";

// Configuramos el cliente S3 apuntando al endpoint de Cloudflare R2
const r2Client = new S3Client({
  region: "auto",
  endpoint: envConfig.r2.endpoint,
  credentials: {
    accessKeyId: envConfig.r2.accessKeyId || "",
    secretAccessKey: envConfig.r2.secretAccessKey || "",
  },
});

export default r2Client;
