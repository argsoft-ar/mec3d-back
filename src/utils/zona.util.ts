/**
 * Utilidades para trabajar con códigos INDEC de zonas (localidades/departamentos).
 *
 * Los códigos INDEC llevan como prefijo los 2 dígitos de la provincia.
 * Como `zona_id` se guarda como INTEGER, los códigos de provincias 01-09
 * pierden el cero inicial: una localidad (8 dígitos) queda con 7 y un
 * departamento (5 dígitos) queda con 4.
 */
export function getProvinciaPrefix(zonaId: number): string | null {
  const codigo = String(zonaId);

  // Longitud canónica (localidad = 8, departamento = 5): los 2 primeros dígitos
  if (codigo.length === 8 || codigo.length === 5) {
    return codigo.substring(0, 2);
  }

  // Perdió el cero inicial (provincias 01-09): se restaura
  if (codigo.length === 7 || codigo.length === 4) {
    return `0${codigo.substring(0, 1)}`;
  }

  return null;
}

export function getPartidoPrefix(zonaId: number): string | null {
  const codigo = String(zonaId);
  if (codigo.length === 8) return codigo.substring(0, 5);
  if (codigo.length === 7) return `0${codigo.substring(0, 4)}`;
  return null;
}
