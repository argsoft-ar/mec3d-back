import { z } from "zod";

export const crearCompraSchema = z.object({
  body: z
    .object({
      disenoId: z.string().uuid("disenoId debe ser un UUID válido"),
      // descarga: se paga ahora (Checkout Pro). fabricacion: ancla de la solicitud; se
      // paga el precio negociado al cerrarse el trato.
      tipo: z.enum(["descarga", "fabricacion"], {
        error: "tipo debe ser descarga o fabricacion",
      }),
      // Nombre de uno de los materiales del diseño; solo aplica a fabricación.
      material: z.string().trim().min(1).max(100).optional(),
    })
    .refine((b) => b.tipo === "fabricacion" || b.material === undefined, {
      message: "material solo aplica a compras de fabricación",
      path: ["material"],
    }),
});
