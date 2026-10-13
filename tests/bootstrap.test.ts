import {
  assertConfirmDb,
  bootstrapDatabase,
  readAdminCredentials,
  resolveDbTarget,
} from "../src/database/bootstrap";

jest.mock("../src/config/db.config", () => ({
  __esModule: true,
  default: { connect: jest.fn(), end: jest.fn() },
}));

describe("db:bootstrap - destino", () => {
  it("usa DB_NAME/DB_HOST/DB_PORT cuando no hay DATABASE_URL", () => {
    expect(
      resolveDbTarget({
        DB_HOST: "localhost",
        DB_PORT: "5433",
        DB_NAME: "mec3d_db",
      }),
    ).toEqual({ host: "localhost:5433", database: "mec3d_db" });
  });

  it("DATABASE_URL gana sobre DB_* y no expone credenciales", () => {
    const target = resolveDbTarget({
      DATABASE_URL:
        "postgresql://user:s3cr3t@db.example.com:6543/otra_db?sslmode=require",
      DB_NAME: "mec3d_db",
    });
    expect(target).toEqual({
      host: "db.example.com:6543",
      database: "otra_db",
    });
    expect(JSON.stringify(target)).not.toContain("s3cr3t");
  });

  it("falla si no se puede determinar la base", () => {
    expect(() => resolveDbTarget({})).toThrow(/DB_NAME/);
    expect(() =>
      resolveDbTarget({ DATABASE_URL: "postgresql://u:p@h/" }),
    ).toThrow(/nombre de la base/);
  });
});

describe("db:bootstrap - --confirm-db", () => {
  const target = { host: "localhost:5433", database: "mec3d_db" };

  it("exige el flag", () => {
    expect(() => assertConfirmDb(["--force"], target)).toThrow(/--confirm-db/);
    expect(() => assertConfirmDb(["--confirm-db="], target)).toThrow(
      /--confirm-db/,
    );
  });

  it("rechaza un nombre distinto al de la base destino", () => {
    expect(() => assertConfirmDb(["--confirm-db=otra_db"], target)).toThrow(
      /no coincide/,
    );
    expect(() => assertConfirmDb(["--confirm-db=MEC3D_DB"], target)).toThrow(
      /no coincide/,
    );
  });

  it("acepta el nombre exacto", () => {
    expect(() =>
      assertConfirmDb(["--force", "--confirm-db=mec3d_db"], target),
    ).not.toThrow();
  });
});

describe("db:bootstrap - credenciales del admin", () => {
  const ok = {
    ADMIN_EMAIL: " Admin@Mec3d.local ",
    ADMIN_PASSWORD: "Clave1234",
  };

  it("normaliza el email y devuelve la contraseña tal cual", () => {
    expect(readAdminCredentials(ok)).toEqual({
      email: "admin@mec3d.local",
      password: "Clave1234",
    });
  });

  it("falla si faltan variables", () => {
    expect(() => readAdminCredentials({})).toThrow(
      /ADMIN_EMAIL, ADMIN_PASSWORD/,
    );
    expect(() => readAdminCredentials({ ADMIN_EMAIL: "a@b.com" })).toThrow(
      /ADMIN_PASSWORD/,
    );
    expect(() => readAdminCredentials({ ADMIN_PASSWORD: "Clave1234" })).toThrow(
      /ADMIN_EMAIL/,
    );
  });

  it("valida el email y la política de contraseña del registro sin filtrar el valor", () => {
    expect(() =>
      readAdminCredentials({ ...ok, ADMIN_EMAIL: "no-es-email" }),
    ).toThrow(/email/);
    for (const password of [
      "corta1A",
      "sinnumeroA",
      "sinmayuscula1",
      "A1" + "x".repeat(71),
    ]) {
      let message = "";
      try {
        readAdminCredentials({ ...ok, ADMIN_PASSWORD: password });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/ADMIN_PASSWORD/);
      expect(message).not.toContain(password);
    }
  });
});

describe("db:bootstrap - transacción", () => {
  const admin = { email: "admin@mec3d.local", passwordHash: "$2b$12$hash" };

  it("hace COMMIT y devuelve el id del admin", async () => {
    const query = jest
      .fn()
      .mockImplementation(async (sql: string) =>
        sql.includes("INSERT INTO usuarios")
          ? { rows: [{ id: "uuid-1" }] }
          : { rows: [] },
      );
    await expect(bootstrapDatabase({ query } as never, admin)).resolves.toBe(
      "uuid-1",
    );
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toBe("SET statement_timeout = 0");
    expect(sqls[1]).toBe("BEGIN");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
  });

  it("hace ROLLBACK y propaga el error si falla el admin", async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO usuarios")) throw new Error("boom");
      return { rows: [] };
    });
    await expect(bootstrapDatabase({ query } as never, admin)).rejects.toThrow(
      "boom",
    );
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
  });
});
