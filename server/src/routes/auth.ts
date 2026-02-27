import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { findOrCreateUser, getUserById, hasApiKey } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// POST /auth/google - Exchange Google ID token for JWT
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body as { idToken: string };
    if (!idToken) {
      res.status(400).json({ error: "idToken is required" });
      return;
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    const user = findOrCreateUser(
      payload.sub,
      payload.email || "",
      payload.name || "",
      payload.picture || null
    );

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        hasApiKey: hasApiKey(user.id),
      },
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Authentication failed" });
  }
});

// GET /auth/me - Get current user info
router.get("/me", requireAuth, (req, res) => {
  const user = getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      hasApiKey: hasApiKey(user.id),
    },
  });
});

export { router as authRouter };
