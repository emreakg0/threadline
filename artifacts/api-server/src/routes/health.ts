import { pool } from "@workspace/db";
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 FROM focus_migrations WHERE name=$1", ["0012_threadline_production_consent"]);
    res.status(result.rowCount ? 200 : 503).json({ status: result.rowCount ? "ready" : "unavailable" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
export default router;
