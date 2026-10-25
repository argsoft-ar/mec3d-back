// Fuente única del catálogo inicial. Los nombres de material son únicos globalmente
// (UNIQUE(nombre)), por eso los homónimos entre tecnologías llevan sufijo: "Nylon" (3D)
// vs "Nylon (CNC)". Así un fabricante o un diseño referencia un material por nombre sin ambigüedad.
export const TECNOLOGIAS_SEED = ["CNC", "Impresión 3D"] as const;

export const MATERIALES_SEED: ReadonlyArray<{
  tecnologia: (typeof TECNOLOGIAS_SEED)[number];
  nombres: readonly string[];
}> = [
  {
    tecnologia: "Impresión 3D",
    nombres: [
      "PLA",
      "PLA+",
      "PETG",
      "ABS",
      "TPU",
      "Nylon",
      "Resina",
      "ASA",
      "PC",
      "HIPS",
      "PVA",
      "Fibra de carbono (CF)",
      "PLA Madera",
      "Flexible (TPE)",
      "PP",
    ],
  },
  {
    tecnologia: "CNC",
    nombres: [
      "Aluminio",
      // "Metal" y "Aluminio" existían en el catálogo hardcodeado anterior: se conservan
      // para no dejar huérfanos a los fabricantes ya cargados.
      "Metal",
      "Acero",
      "Acero inoxidable",
      "Latón",
      "Cobre",
      "Bronce",
      "Madera",
      "MDF",
      "Acrílico",
      "Delrin (POM)",
      "Nylon (CNC)",
      "Policarbonato (CNC)",
      "Espuma/Foam",
      "Titanio",
    ],
  },
];

const sqlLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;

// SQL idempotente (ON CONFLICT DO NOTHING) construido solo con constantes de este archivo,
// nunca con input externo; se ejecuta como parte de scripts multi-statement sin parámetros.
export const CATALOGO_SEED_SQL = `
  INSERT INTO tecnologias (nombre) VALUES
    ${TECNOLOGIAS_SEED.map((t) => `(${sqlLiteral(t)})`).join(",\n    ")}
  ON CONFLICT (nombre) DO NOTHING;

  INSERT INTO materiales (nombre, tecnologia_id)
  SELECT v.nombre, t.id
  FROM (VALUES
    ${MATERIALES_SEED.flatMap((g) =>
      g.nombres.map((n) => `(${sqlLiteral(n)}, ${sqlLiteral(g.tecnologia)})`),
    ).join(",\n    ")}
  ) AS v(nombre, tecnologia)
  JOIN tecnologias t ON t.nombre = v.tecnologia
  ON CONFLICT (nombre) DO NOTHING;
`;
