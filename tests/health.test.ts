import request from "supertest";
import app from "../src/app";
import pool from "../src/config/db.config";

afterAll(async () => {
  await pool.end();
});

describe("GET /api/v1/health", () => {
  it("should return 200 with status ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/unknown-route");
    expect(res.status).toBe(404);
  });
});
