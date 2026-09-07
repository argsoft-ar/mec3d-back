import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateSchema = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Reasignamos req.body/query/params con la salida parseada de Zod: esto es crítico
      // porque Zod descarta (strip) las claves no declaradas en el schema solo en el valor
      // de retorno, nunca en el objeto original. Si no reasignamos, claves extra enviadas
      // por el cliente siguen llegando intactas a controladores/repositorios (mass-assignment
      // que en diseno.repository.ts se traduce en inyección de nombres de columna SQL).
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Error de validación en los datos ingresados',
          details: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
};
