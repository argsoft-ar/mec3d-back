import { quitarBarrasFinales } from "./url.util";

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Allowlist de orígenes del front (CORS_ORIGIN, separados por coma). Con credentials el
// comodín '*' no es válido, así que se descarta.
export function parseAllowedOrigins(
  raw: string | undefined = process.env.CORS_ORIGIN,
): string[] {
  return (raw || "http://localhost:5173")
    .split(",")
    .map((o) => quitarBarrasFinales(o.trim()))
    .filter((o) => o.length > 0 && o !== "*");
}

// En producción el CORS del bucket no admite '*', http:// ni orígenes locales; lanza ante cualquiera.
export function validarOrigenesCorsProduccion(
  origenes: readonly string[],
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== "production") return;
  const invalidos: string[] = [];
  for (const origen of origenes) {
    let motivo: string | null = null;
    if (origen === "*") {
      motivo = "comodín '*'";
    } else {
      try {
        const url = new URL(origen);
        if (url.protocol !== "https:") motivo = "no usa https";
        else if (HOSTS_LOCALES.has(url.hostname.toLowerCase()))
          motivo = "es un origen local";
      } catch {
        motivo = "no es una URL válida";
      }
    }
    if (motivo) invalidos.push(`${origen} (${motivo})`);
  }
  if (invalidos.length > 0) {
    throw new Error(
      `CORS_ORIGIN inválido para producción: ${invalidos.join(", ")}. Usá solo orígenes https:// reales.`,
    );
  }
}
