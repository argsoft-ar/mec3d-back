import { MIGRATIONS, PREVIEW_URL_CHECK_SQL } from "../src/database/migrations";
import { SCHEMA_SQL } from "../src/database/init";
import { PREVIEW_KEY_REGEX } from "../src/services/archivo.service";

describe("migración 7: CHECK de preview_url", () => {
  const m7 = MIGRATIONS.find((m) => m.version === 7);

  it("es la última, sin tocar las versiones 1-6 ya aplicadas", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(MIGRATIONS[5].sql).toBe(
      "ALTER TABLE disenos ADD COLUMN IF NOT EXISTS preview_url TEXT NULL;",
    );
  });

  it("es idempotente y no falla con datos existentes (anula inválidos, NOT VALID + VALIDATE)", () => {
    const sql = m7!.sql;
    expect(sql).toMatch(/UPDATE disenos SET preview_url = NULL/);
    expect(sql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/);
    expect(sql).toMatch(/NOT VALID/);
    expect(sql).toMatch(/VALIDATE CONSTRAINT chk_diseno_preview_key/);
  });

  it("init.ts crea la misma restricción para bases nuevas", () => {
    expect(SCHEMA_SQL).toContain("chk_diseno_preview_key");
    expect(SCHEMA_SQL).toContain(PREVIEW_URL_CHECK_SQL);
  });

  it("el patrón SQL es el mismo que PREVIEW_KEY_REGEX", () => {
    const patron = /'(\^previews[^']*\$)'/.exec(PREVIEW_URL_CHECK_SQL)![1];
    expect(new RegExp(patron).source).toBe(PREVIEW_KEY_REGEX.source);
  });
});
