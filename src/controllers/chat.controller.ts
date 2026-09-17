import { Request, Response, NextFunction } from "express";
import { chatService } from "../services/chat.service";

export const getMensajes = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await chatService.listarMensajes(id, userId, page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
