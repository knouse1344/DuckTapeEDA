import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { settingsRouter } from "./routes/settings.js";
import { chatRouter } from "./routes/chat.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Body parsing
app.use(express.json());

// CORS for dev (frontend on :5173 talks to server on :3001)
if (process.env.NODE_ENV !== "production") {
  app.use(
    cors({
      origin: "http://localhost:5173",
      credentials: true,
    })
  );
}

// API routes
app.use("/auth", authRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/chat", chatRouter);

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, "../../dist");
  app.use(express.static(distPath));
  app.get("{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`DuckTape EDA server running on port ${PORT}`);
});
