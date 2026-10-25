import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

export const listarMensajesSchema = z.object({
  params: z.object({
    id: z.string().uuid("El ID debe ser un UUID válido"),
  }),
  query: paginationSchema.shape.query,
});
