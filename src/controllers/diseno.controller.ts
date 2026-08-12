import { Request, Response, NextFunction } from "express";
import { productService } from "../services/product.service";
import { PaginationParams } from "../interfaces/pagination.interface";

export const getAllProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const pagination: PaginationParams = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 12,
    };

    const zonaId = req.query.zonaId ? Number(req.query.zonaId) : undefined;
    const categoria =
      typeof req.query.categoria === "string" ? req.query.categoria : undefined;

    const result = await productService.getAll(pagination, zonaId, categoria);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.id || req.body.disenadorId;

    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const product = await productService.create(req.body, userId);

    res.status(201).json({
      message: "Producto creado exitosamente",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (
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

    const product = await productService.update(id, req.body, userId);

    res.status(200).json({
      message: "Producto actualizado exitosamente",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const partialUpdateProduct = async (
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

    const product = await productService.partialUpdate(id, req.body, userId);

    res.status(200).json({
      message: "Producto modificado exitosamente",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (
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

    await productService.delete(id, userId);

    res.status(200).json({ message: "Producto eliminado exitosamente" });
  } catch (error) {
    next(error);
  }
};

export const getMyProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const products = await productService.getByDesigner(userId);
    res.status(200).json(products);
  } catch (error) {
    next(error);
  }
};
