import { Request, Response } from "express";

const MATERIALES_CATALOGO = [
  { id: 1, nombre: "Aluminio" },
  { id: 2, nombre: "Metal" },
  { id: 3, nombre: "ASA" },
  { id: 4, nombre: "PETG" },
  { id: 5, nombre: "PLA" },
  { id: 6, nombre: "ABS" },
  { id: 7, nombre: "Nylon" },
];

const TECNOLOGIAS_CATALOGO = [
  { id: 1, nombre: "CNC" },
  { id: 2, nombre: "Impresión 3D" },
];

export const getMateriales = (_req: Request, res: Response): void => {
  res.status(200).json(MATERIALES_CATALOGO);
};

export const getTecnologias = (_req: Request, res: Response): void => {
  res.status(200).json(TECNOLOGIAS_CATALOGO);
};
