import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../utils/session-cookie.util";

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { body, sessionToken } = await authService.register(req.body);
    setSessionCookie(res, sessionToken);
    res.status(201).json(body);
  } catch (error) {
    next(error);
  }
};

export const checkUsernameDisponible = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.checkUsernameDisponible(
      req.query.username as string,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { body, sessionToken } = await authService.login(req.body);
    setSessionCookie(res, sessionToken);
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.me(req.user!.id);
    res.set("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Idempotente: borra la cookie aunque no haya sesión.
export const logoutUser = (_req: Request, res: Response): void => {
  clearSessionCookie(res);
  res.status(204).end();
};

export const createSocketToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    res.set("Cache-Control", "no-store");
    res.status(200).json(authService.createSocketToken(req.user!));
  } catch (error) {
    next(error);
  }
};
