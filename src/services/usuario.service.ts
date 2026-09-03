import { userRepository } from "../repositories/user.repository";
import { Tecnologia, UpdateProfileDTO } from "../interfaces/user.interface";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../errors/app-error";
import { getProvinciaPrefix } from "../utils/zona.util";

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

  async updateProfile(userId: string, data: UpdateProfileDTO) {
    if (data.username !== undefined) {
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

  async changeRol(userId: string, rol: string): Promise<any> {
    const result = await userRepository.updateRol(userId, rol);
    if (!result) throw new NotFoundError("Usuario no encontrado");
    if (rol !== "fabricante") {
      await userRepository.clearFabricanteRows(userId);
    }
    return result;
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
    await userRepository.setTecnologiasFabricante(userId, tecnologias);
    return userRepository.getTecnologiasFabricante(userId);
  },

  async checkUsernameDisponible(
    username: string,
    currentUserId?: string,
  ): Promise<{ disponible: boolean }> {
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
