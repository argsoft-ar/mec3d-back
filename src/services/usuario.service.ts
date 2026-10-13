import { userRepository } from "../repositories/user.repository";
import { Tecnologia, UpdateProfileDTO } from "../interfaces/user.interface";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../errors/app-error";
import { getProvinciaPrefix } from "../utils/zona.util";
import { isReservedUsername } from "../utils/username.util";
import { withTransaction } from "../utils/transaction.util";
import { cuentaEnCooldown, cuentaHabilitadaDesde } from "../utils/policy.util";
import { catalogoService } from "./catalogo.service";

export const usuarioService = {
  async getProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("Usuario no encontrado");
    const materiales =
      user.rol_principal === "fabricante"
        ? await userRepository.getMaterialesFabricante(userId)
        : [];
    const tecnologias =
      user.rol_principal === "fabricante"
        ? await userRepository.getTecnologiasFabricante(userId)
        : [];
    return { ...mapUserRow(user), materiales, tecnologias };
  },

  // Perfil público de un fabricante (endpoint sin auth): expone únicamente datos de
  // negocio, nunca PII (email, teléfono, dirección, cuenta de Mercado Pago). Solo
  // aplica a cuentas con rol "fabricante"; para cualquier otro usuario responde 404
  // en vez de confirmar su existencia (evita enumeración de cuentas no-fabricante).
  async getPublicFabricanteProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (user?.rol_principal !== "fabricante") {
      throw new NotFoundError("Fabricante no encontrado");
    }
    const materiales = await userRepository.getMaterialesFabricante(userId);
    const tecnologias = await userRepository.getTecnologiasFabricante(userId);
    return {
      id: user.id,
      username: user.username,
      rolPrincipal: user.rol_principal,
      zonaId: user.zona_id,
      puntuacion: Number.parseFloat(user.puntuacion) || 0,
      tagline: user.tagline,
      descripcion: user.descripcion,
      experiencia: user.experiencia,
      materiales,
      tecnologias,
    };
  },

  async updateProfile(userId: string, data: UpdateProfileDTO) {
    // Empty string is a shared "no username" placeholder in DB, not a real value to check
    if (data.username !== undefined && data.username !== "") {
      const taken = await userRepository.isUsernameTaken(data.username, userId);
      if (taken) throw new ConflictError("El nombre de usuario ya está en uso");
    }
    const updated = await userRepository.updateProfile(userId, data);
    if (!updated) throw new NotFoundError("Usuario no encontrado");
    return mapUserRow(updated);
  },

  async setMateriales(userId: string, materiales: string[]) {
    const user = await userRepository.findById(userId);
    if (user?.rol_principal !== "fabricante")
      throw new ForbiddenError(
        "Solo los fabricantes pueden configurar materiales",
      );
    // Solo valores del catálogo: un nombre inexistente corta con 400 antes de escribir.
    const resueltos = await catalogoService.resolverMateriales(materiales);
    await userRepository.setMaterialesFabricante(userId, resueltos);
    return userRepository.getMaterialesFabricante(userId);
  },

  async getFabricantesCercanos(
    zonaId: number | undefined,
    page: number,
    limit: number,
  ) {
    const provinciaPrefix = zonaId != null ? getProvinciaPrefix(zonaId) : null;
    return userRepository.getFabricantesCercanos(
      zonaId ?? null,
      provinciaPrefix,
      limit,
      (page - 1) * limit,
    );
  },

  // Atómico: el rol y la limpieza de datos de fabricante se aplican juntos. No se permite
  // cambiar de rol con órdenes en curso ni con fondos retenidos o payouts pendientes, que
  // quedarían huérfanos de la función que los respalda.
  async changeRol(userId: string, rol: string): Promise<any> {
    return withTransaction(async (client) => {
      const actual = await userRepository.lockRolById(client, userId);
      if (!actual) throw new NotFoundError("Usuario no encontrado");

      if (actual.rol_principal !== rol) {
        if (await userRepository.tieneOrdenesActivas(client, userId)) {
          throw new ConflictError(
            "No podés cambiar de rol mientras tengas órdenes de fabricación en curso",
          );
        }
        if (await userRepository.tieneMovimientosPendientes(client, userId)) {
          throw new ConflictError(
            "No podés cambiar de rol mientras tengas fondos retenidos o pagos pendientes",
          );
        }
      }

      const result = await userRepository.updateRol(userId, rol, client);
      if (!result) throw new NotFoundError("Usuario no encontrado");
      if (rol !== "fabricante") {
        await userRepository.clearFabricanteRows(client, userId);
      }
      return result;
    });
  },

  async setTecnologias(
    userId: string,
    tecnologias: string[],
  ): Promise<Tecnologia[]> {
    const user = await userRepository.findById(userId);
    if (user?.rol_principal !== "fabricante")
      throw new ForbiddenError(
        "Solo los fabricantes pueden configurar tecnologías",
      );
    const resueltas = await catalogoService.resolverTecnologias(tecnologias);
    await userRepository.setTecnologiasFabricante(userId, resueltas);
    return userRepository.getTecnologiasFabricante(userId);
  },

  async checkUsernameDisponible(
    username: string,
    currentUserId?: string,
  ): Promise<{ disponible: boolean }> {
    if (isReservedUsername(username)) return { disponible: false };
    const taken = await userRepository.isUsernameTaken(username, currentUserId);
    return { disponible: !taken };
  },
};

function mapUserRow(row: any) {
  return {
    id: row.id,
    email: row.email,
    rolPrincipal: row.rol_principal,
    zonaId: row.zona_id,
    puntuacion: Number.parseFloat(row.puntuacion) || 0,
    cuentaMercadopago: row.cuenta_mercadopago,
    cuentaMercadopagoEnCooldown: cuentaEnCooldown(
      row.cuenta_mercadopago_actualizada_en,
    ),
    cuentaMercadopagoHabilitadaDesde:
      cuentaHabilitadaDesde(
        row.cuenta_mercadopago_actualizada_en,
      )?.toISOString() ?? null,
    tagline: row.tagline,
    descripcion: row.descripcion,
    experiencia: row.experiencia,
    actualizadoEn: row.actualizado_en,
    georefLocalidadId: row.georef_localidad_id,
    username: row.username,
    telefono: row.telefono,
    direccion: row.direccion,
  };
}
