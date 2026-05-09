import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/user.repository';
import { generateToken } from '../utils/jwt.util';

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, rol_principal, zona_id } = req.body;

    // Zod ya garantiza que estos datos vienen correctos y con los tipos adecuados

    // Verificar si el usuario ya existe
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      res.status(409).json({ error: 'El email ya está registrado' });
      return;
    }

    // Encriptar la contraseña usando bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Guardar en la base de datos
    const newUser = await userRepository.createUser({
      email,
      passwordHash,
      rolPrincipal: rol_principal,
      zonaId: zona_id
    });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: newUser
    });
  } catch (error: any) {
    console.error('❌ Error en el registro de usuario:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al registrar el usuario',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Zod ya garantiza que estos datos vienen correctos

    // 2. Buscar usuario por email
    const user = await userRepository.findByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    // 3. Comparar contraseñas
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    // 4. Generar el JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      rol_principal: user.rol_principal
    });

    // 5. Devolver token y datos básicos del usuario (nunca el password_hash)
    res.status(200).json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        email: user.email,
        rol_principal: user.rol_principal,
        zona_id: user.zona_id,
        cuenta_mercadopago: user.cuenta_mercadopago
      }
    });

  } catch (error: any) {
    console.error('❌ Error en el login:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor en el login',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
