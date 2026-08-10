import { userRepository } from "../repositories/user.repository";
import { UpdateProfileDTO } from "../interfaces/user.interface";
import { NotFoundError, ForbiddenError } from "../errors/app-error";
import { getProvinciaPrefix } from "../utils/zona.util";

export const usuarioService = {
  async getProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("Usuario no encontrado");
    const materiales =
      user.rol_principal === "fabricante"
        ? await userRepository.getMaterialesFabricante(userId)
        : [];
    return { ...mapUserRow(user), materiales };
  },

  async updateProfile(userId: string, data: UpdateProfileDTO) {
    const updated = await userRepository.updateProfile(userId, data);
    if (!updated) throw new NotFoundError("Usuario no encontrado");
    return mapUserRow(updated);
  },

  async setMateriales(
    userId: string,
    rolPrincipal: string,
    materiales: string[],
  ) {
    if (rolPrincipal !== "fabricante")
      throw new ForbiddenError(
        "Solo los fabricantes pueden configurar materiales",
      );
    await userRepository.setMaterialesFabricante(userId, materiales);
    return userRepository.getMaterialesFabricante(userId);
  },

  async getFabricantesCercanos(zonaId?: number) {
    const provinciaPrefix = zonaId != null ? getProvinciaPrefix(zonaId) : null;
    return userRepository.getFabricantesCercanos(
      zonaId ?? null,
      provinciaPrefix,
    );
  },
};

function mapUserRow(row: any) {
  return {
    id: row.id,
    email: row.email,
    rolPrincipal: row.rol_principal,
    zonaId: row.zona_id,
    puntuacion: parseFloat(row.puntuacion) || 0,
    cuentaMercadopago: row.cuenta_mercadopago,
    tagline: row.tagline,
    descripcion: row.descripcion,
    experiencia: row.experiencia,
    actualizadoEn: row.actualizado_en,
  };
}
