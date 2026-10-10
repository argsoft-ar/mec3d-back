import { Request, Response, NextFunction } from "express";
import { ordenFabricacionService } from "../services/orden-fabricacion.service";
import { disputaService } from "../services/disputa.service";
import type { DisputasQuery } from "../schemas/orden-fabricacion.schema";

export const crearOrdenesFabricacion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const compradorId = req.user?.id;
    if (!compradorId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const { compraId, fabricanteIds } = req.body;

    const ordenes = await ordenFabricacionService.crear(
      compraId,
      fabricanteIds,
      compradorId,
    );

    res.status(201).json({
      message: "Solicitudes de fabricación creadas",
      data: ordenes,
    });
  } catch (error) {
    next(error);
  }
};

export const getFabricantesSugeridos = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const compradorId = req.user?.id;
    if (!compradorId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const disenoId = req.query.disenoId as string;
    const compraId = req.query.compraId as string;
    const material = req.query.material as string | undefined;
    // page y limit ya vienen validados (limit <= 50) y convertidos a number.
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const fabricantes = await ordenFabricacionService.fabricantesSugeridos(
      disenoId,
      compraId,
      compradorId,
      page,
      limit,
      material,
    );
    res.status(200).json(fabricantes);
  } catch (error) {
    next(error);
  }
};

export const proponerPrecio = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { precio } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const orden = await ordenFabricacionService.proponerPrecio(
      id,
      precio,
      userId,
    );
    res
      .status(200)
      .json({ message: "Precio propuesto registrado", data: orden });
  } catch (error) {
    next(error);
  }
};

export const cerrarTrato = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { precio } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const { orden, pagoRequerido, initPoint } =
      await ordenFabricacionService.cerrarTrato(id, precio, userId);
    res.status(200).json({
      message: "Confirmación de cierre registrada",
      data: orden,
      pagoRequerido,
      initPoint,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelarOrden = async (
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
    const { orden, reembolso } = await ordenFabricacionService.cancelar(
      req.params.id,
      userId,
    );
    res
      .status(200)
      .json({ message: "Orden cancelada", data: orden, reembolso });
  } catch (error) {
    next(error);
  }
};

export const getCodigoEntrega = async (
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

    const data = await ordenFabricacionService.getCodigoEntrega(id, userId);
    res.set("Cache-Control", "no-store");
    res.status(200).json({ message: "Código de entrega obtenido", data });
  } catch (error) {
    next(error);
  }
};

export const declararEntregaOrden = async (
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

    const orden = await ordenFabricacionService.declararEntrega(id, userId);
    res.status(200).json({
      message: "Entrega confirmada, pendiente de validación del fabricante",
      data: orden,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmarEntregaOrden = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { codigo } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const orden = await ordenFabricacionService.confirmarEntrega(
      id,
      codigo,
      userId,
    );
    res.status(200).json({ message: "Entrega confirmada", data: orden });
  } catch (error) {
    next(error);
  }
};

export const getMisSolicitudesFabricacion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const fabricanteId = req.user?.id;
    if (!fabricanteId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const ordenes = await ordenFabricacionService.misSolicitudes(fabricanteId);
    res.status(200).json({ message: "Solicitudes obtenidas", data: ordenes });
  } catch (error) {
    next(error);
  }
};

export const descargarDiseno = async (
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

    const archivoUrl = await ordenFabricacionService.getArchivoDescarga(
      id,
      userId,
    );
    res.set("Cache-Control", "no-store");
    res.redirect(302, archivoUrl);
  } catch (error) {
    next(error);
  }
};

export const disputarOrden = async (
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
    const { motivo } = req.body as { motivo: string };
    const orden = await disputaService.abrir(req.params.id, userId, motivo);
    res.status(200).json({
      message: "Disputa abierta: los fondos quedan congelados hasta que un administrador la resuelva",
      data: orden,
    });
  } catch (error) {
    next(error);
  }
};

export const listarDisputas = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { page, limit, estado } = req.query as unknown as DisputasQuery;
    res.status(200).json(await disputaService.listar({ page, limit }, estado));
  } catch (error) {
    next(error);
  }
};

export const resolverDisputa = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const { resolucion, nota } = req.body as {
      resolucion: "liberar_fabricante" | "reembolsar_comprador";
      nota: string;
    };
    const resultado = await disputaService.resolver(
      req.params.ordenId,
      adminId,
      resolucion,
      nota,
    );
    res.status(200).json({ message: "Disputa resuelta", ...resultado });
  } catch (error) {
    next(error);
  }
};
