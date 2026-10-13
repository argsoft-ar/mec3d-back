// Nombres no registrables; se comparan contra el username ya normalizado a minúsculas.
export const RESERVED_USERNAMES: readonly string[] = [
  "admin",
  "administrator",
  "root",
  "support",
  "soporte",
  "mec3d",
  "moderador",
  "moderator",
  "system",
  "null",
  "undefined",
  "api",
  "www",
];

export const isReservedUsername = (username: string): boolean =>
  RESERVED_USERNAMES.includes(username.trim().toLowerCase());
