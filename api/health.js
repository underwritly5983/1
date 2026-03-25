/**
 * Lightweight health check — confirms serverless /api routes deploy (no Express cold start).
 * GET /api/health
 */
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
};
