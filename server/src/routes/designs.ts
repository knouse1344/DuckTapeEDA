import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  insertDesign,
  updateDesign,
  listDesigns,
  getDesign,
  deleteDesign,
} from "../db.js";

const router = Router();

// POST /api/designs — Save a new design
router.post("/", requireAuth, (req, res) => {
  const { name, description, designJson, chatJson } = req.body as {
    name: string;
    description?: string;
    designJson: string;
    chatJson: string;
  };

  if (!name || !designJson) {
    res.status(400).json({ error: "name and designJson are required" });
    return;
  }

  const id = insertDesign(
    req.user!.userId,
    name,
    description || "",
    designJson,
    chatJson || "[]"
  );

  res.json({ id });
});

// GET /api/designs — List user's designs
router.get("/", requireAuth, (req, res) => {
  const designs = listDesigns(req.user!.userId);
  res.json({ designs });
});

// GET /api/designs/:id — Get a single design
router.get("/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid design id" });
    return;
  }

  const design = getDesign(id, req.user!.userId);
  if (!design) {
    res.status(404).json({ error: "Design not found" });
    return;
  }

  res.json({ design });
});

// PUT /api/designs/:id — Update a design
router.put("/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid design id" });
    return;
  }

  const { name, description, designJson, chatJson } = req.body as {
    name: string;
    description?: string;
    designJson: string;
    chatJson: string;
  };

  if (!name || !designJson) {
    res.status(400).json({ error: "name and designJson are required" });
    return;
  }

  const updated = updateDesign(
    id,
    req.user!.userId,
    name,
    description || "",
    designJson,
    chatJson || "[]"
  );

  if (!updated) {
    res.status(404).json({ error: "Design not found" });
    return;
  }

  res.json({ success: true });
});

// DELETE /api/designs/:id — Delete a design
router.delete("/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid design id" });
    return;
  }

  const deleted = deleteDesign(id, req.user!.userId);
  if (!deleted) {
    res.status(404).json({ error: "Design not found" });
    return;
  }

  res.json({ success: true });
});

export { router as designsRouter };
