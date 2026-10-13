import {
  MercadoPagoConfig,
  Payment,
  PaymentRefund,
  Preference,
} from "mercadopago";
import { getMercadoPagoSettings } from "./env.config";

export interface MercadoPagoClients {
  preference: Preference;
  payment: Payment;
  refund: PaymentRefund;
}

let cache: { accessToken: string; clients: MercadoPagoClients } | null = null;

// Cliente perezoso: la app y los scripts de DB arrancan sin credenciales de pago;
// los endpoints que las necesitan responden 503 (ver getMercadoPagoSettings).
export function getMercadoPagoClients(): MercadoPagoClients {
  const { accessToken } = getMercadoPagoSettings();
  if (cache?.accessToken === accessToken) return cache.clients;

  const config = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 10_000 },
  });
  const clients: MercadoPagoClients = {
    preference: new Preference(config),
    payment: new Payment(config),
    refund: new PaymentRefund(config),
  };
  cache = { accessToken, clients };
  return clients;
}

export function resetMercadoPagoClientsForTests(): void {
  cache = null;
}
