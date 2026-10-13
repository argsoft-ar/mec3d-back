import pool from "../config/db.config";
import { ComisionesConfig } from "../utils/comisiones.util";
import { Db } from "../utils/transaction.util";

export const comisionRepository = {
  // Se leen al aprobarse cada pago: un cambio de porcentaje solo afecta a pagos futuros.
  async getConfig(db: Db = pool): Promise<ComisionesConfig> {
    const result = await db.query<{ clave: string; valor_bps: number }>(
      `SELECT clave, valor_bps FROM configuracion_comisiones
       WHERE clave IN ('plataforma', 'regalia_disenador');`,
    );
    const porClave = new Map(result.rows.map((r) => [r.clave, r.valor_bps]));
    const plataformaBps = porClave.get("plataforma");
    const regaliaDisenadorBps = porClave.get("regalia_disenador");
    if (plataformaBps === undefined || regaliaDisenadorBps === undefined) {
      throw new Error(
        "Falta configuración de comisiones (configuracion_comisiones)",
      );
    }
    return { plataformaBps, regaliaDisenadorBps };
  },
};
