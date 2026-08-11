import { z } from "zod";

export const paginationSchema = z.object({
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/, "page debe ser un número entero positivo")
      .transform(Number)
      .default("1")
      .refine((n) => n >= 1 && n <= 100_000, "page debe estar entre 1 y 100000"),
    limit: z
      .string()
      .regex(/^\d+$/, "limit debe ser un número entero positivo")
      .transform(Number)
      .default("12")
      .refine((n) => n >= 1 && n <= 100, "limit debe estar entre 1 y 100"),
  }),
});

export type PaginationQuery = z.infer<typeof paginationSchema>["query"];
