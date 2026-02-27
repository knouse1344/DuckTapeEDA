import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { saveApiKey, deleteApiKey } from "../db.js";
import { encryptApiKey } from "../crypto.js";

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key";

// POST /api/settings/api-key - Save Anthropic API key
router.post("/api-key", requireAuth, (req, res) => {
  const { apiKey } = req.body as { apiKey: string };
  if (!apiKey) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  const { encrypted, iv } = encryptApiKey(apiKey, ENCRYPTION_KEY);
  saveApiKey(req.user!.userId, encrypted, iv);

  res.json({ success: true });
});

// DELETE /api/settings/api-key - Remove saved API key
router.delete("/api-key", requireAuth, (req, res) => {
  deleteApiKey(req.user!.userId);
  res.json({ success: true });
});

export { router as settingsRouter };
