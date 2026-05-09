import pool from '../config/db.config';

export const userRepository = {
  async findByEmail(email: string) {
    const query = `
      SELECT id, email, password_hash, rol_principal, zona_id, puntuacion, cuenta_mercadopago, creado_en, actualizado_en
      FROM usuarios
      WHERE email = $1;
    `;
    const result = await pool.query(query, [email]);
    return result.rows[0] || null;
  },

  async createUser(userData: {
    email: string;
    passwordHash: string;
    rolPrincipal: string;
    zonaId?: number;
  }) {
    const query = `
      INSERT INTO usuarios (email, password_hash, rol_principal, zona_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, rol_principal, zona_id, creado_en;
    `;
    
    const values = [
      userData.email,
      userData.passwordHash,
      userData.rolPrincipal,
      userData.zonaId || null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }
};
