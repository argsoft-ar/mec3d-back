import { envConfig } from "../config/env.config";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Host de la DB a la que apuntan los scripts: DATABASE_URL o, si no, DB_HOST.
function hostDeLaDb(env: NodeJS.ProcessEnv): string | null {
  if (env.DATABASE_URL) {
    try {
      return new URL(env.DATABASE_URL).hostname.toLowerCase();
    } catch {
      // URL ilegible: se trata como remota.
      return "";
    }
  }
  return env.DB_HOST ? env.DB_HOST.trim().toLowerCase() : null;
}

export function isLocalDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  const host = hostDeLaDb(env);
  return host === null || LOCAL_HOSTS.has(host);
}

// Scripts destructivos (init / truncate / seed): nunca en producción, solo con confirmación
// explícita (--force o CONFIRM_DESTRUCTIVE=yes) y, contra una DB que no sea local, solo
// con --force explícito (CONFIRM_DESTRUCTIVE no alcanza).
export function assertDestructiveAllowed(
  script: string,
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string = envConfig.nodeEnv,
): void {
  if (nodeEnv === "production") {
    throw new Error(`${script} no puede ejecutarse con NODE_ENV=production`);
  }
  if (!argv.includes("--force") && env.CONFIRM_DESTRUCTIVE !== "yes") {
    throw new Error(
      `${script} modifica o borra datos. Reintentá con --force (npm run <script> -- --force) o CONFIRM_DESTRUCTIVE=yes`,
    );
  }
  if (!isLocalDatabase(env) && !argv.includes("--force")) {
    throw new Error(
      `${script} apunta a una base de datos que no es localhost: requiere --force explícito (npm run <script> -- --force)`,
    );
  }
}

export function guardOrExit(script: string): void {
  try {
    assertDestructiveAllowed(script);
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
