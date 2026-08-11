import { Request, Response, NextFunction } from "express";
import { georefService } from "../services/georef.service";

export const getProvincias = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const provincias = await georefService.getProvincias();
    res.status(200).json({
      message: "Provincias obtenidas exitosamente",
      data: provincias,
    });
  } catch (error) {
    next(error);
  }
};

export const getDepartamentos = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { provinciaId } = req.params;
    const departamentos = await georefService.getDepartamentos(provinciaId);
    res.status(200).json({
      message: "Departamentos obtenidos exitosamente",
      data: departamentos,
    });
  } catch (error) {
    next(error);
  }
};

export const getLocalidades = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const provincia = req.query.provincia as string;
    const departamento = req.query.departamento as string | undefined;

    const localidades = await georefService.getLocalidades(
      provincia,
      departamento,
    );
    res.status(200).json({
      message: "Localidades obtenidas exitosamente",
      data: localidades,
    });
  } catch (error) {
    next(error);
  }
};
