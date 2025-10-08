// server.mjs  (or server.js with "type": "module" in package.json)
import express from "express";
import multer from "multer";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

function extractText(genaiResponse) {
  // Newer SDKs expose a .text() method
  if (genaiResponse && typeof genaiResponse.text === "function") {
    return genaiResponse.text();
  }
  // Fallback: stitch together text parts from the first candidate
  const parts = genaiResponse?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
  }
  // Last resort: stringify so you at least see something
  return JSON.stringify(genaiResponse);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const MODEL_ID = "gemini-2.0-flash";

// Prefer GOOGLE_API_KEY, fallback to GEMINI_API_KEY
const apiKey =
  process.env.GOOGLE_API_KEY || "";
const  ai= new GoogleGenAI({ apiKey });

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Multer for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    // ensure dir
    try {
      // use fs from 'fs' (sync path) just for simplicity
      require("fs").mkdirSync(uploadDir, { recursive: true });
    } catch {}
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB, max 10 files
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "text/plain",
      "text/markdown",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    cb(
      allowed.has(file.mimetype)
        ? null
        : new Error(`File type ${file.mimetype} is not supported`),
      allowed.has(file.mimetype)
    );
  },
});

// helpers
async function fileToGenerativePart(filePath, mimeType) {
  const fileData = await fs.readFile(filePath);
  return {
    inlineData: {
      data: fileData.toString("base64"),
      mimeType,
    },
  };
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

// CHAT endpoint (uses @google/genai)
app.post("/chat", upload.array("files", 10), async (req, res) => {
  // cleanup helper to remove any uploaded temp files
  const cleanup = async () => {
    if (req.files && req.files.length) {
      await Promise.all(
        req.files.map(async (f) => {
          try {
            await fs.unlink(f.path);
          } catch {}
        })
      );
    }
  };

  try {
    const { prompt } = req.body;
    const files = req.files || [];

    if (!prompt && files.length === 0) {
      await cleanup();
      return res
        .status(400)
        .json({ error: "Please provide a prompt or upload files" });
    }

    if (!apiKey) {
      await cleanup();
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    // Build the "parts" array for the user message
    const userParts = [];
    if (prompt) userParts.push({ text: String(prompt) });

    for (const file of files) {
      try {
        const mimeType = file.mimetype;
        const filePath = file.path;

        if (mimeType.startsWith("image/")) {
          // Image -> inlineData
          const imagePart = await fileToGenerativePart(filePath, mimeType);
          userParts.push(imagePart);
          if (!prompt) {
            userParts.push({
              text: "Please analyze this image and describe what you see in detail.",
            });
          }
        } else if (mimeType === "text/plain" || mimeType === "text/markdown") {
          // Text files -> inline text
          const textContent = await readTextFile(filePath);
          userParts.push({
            text: `Content of file "${file.originalname}":\n${textContent}`,
          });
          if (!prompt)
            userParts.push({
              text: "Please summarize the content of this file.",
            });
        } else if (
          mimeType === "application/pdf" ||
          mimeType === "application/msword" ||
          mimeType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          // PDFs / Word: ask for text
          userParts.push({
            text:
              `I received a ${
                mimeType.includes("pdf") ? "PDF" : "Word"
              } document named "${file.originalname}". ` +
              `For better analysis, please convert this document to plain text or paste the content directly.`,
          });
        }
      } catch (fileErr) {
        console.error("Error processing file:", file.originalname, fileErr);
        // keep going for other files
      }
    }

    // Always attempt to remove temp files after we’ve read them
    await cleanup();

    if (userParts.length === 0) {
      return res.status(400).json({ error: "No valid content to process" });
    }

    console.log("Sending request to Gemini with", userParts.length, "parts");

    const result = await ai.models.generateContent({
      model: MODEL_ID,
      contents: [{ role: "user", parts: userParts }],
    });

    const output = extractText(result);
    return res.json({ output, filesProcessed: req.files?.length || 0 });
  } catch (error) {
    console.error("Error in chat endpoint:", error);

    // best-effort cleanup
    try {
      if (req.files?.length) {
        await Promise.all(
          req.files.map((f) => fs.unlink(f.path).catch(() => {}))
        );
      }
    } catch {}

    const msg = error?.message || String(error);

    if (msg.includes("API key") || msg.includes("UNAUTHENTICATED")) {
      return res.status(500).json({ error: "Invalid API key configuration" });
    }
    if (msg.includes("SAFETY")) {
      return res
        .status(400)
        .json({ error: "Content was blocked by safety filters" });
    }
    if (msg.includes("QUOTA") || msg.includes("RESOURCE_EXHAUSTED")) {
      return res
        .status(429)
        .json({ error: "API quota exceeded. Please try again later." });
    }

    return res.status(500).json({
      error: msg,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Health
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(apiKey),
    model: MODEL_ID,
  });
});

// Test endpoint
app.get("/test-gemini", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }
    const result = await ai.models.generateContent({
      model: MODEL_ID,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Respond exactly with: Gemini AI is working correctly!" },
          ],
        },
      ],
    });
    return res.json({ status: "success", message: extractText(result) });
  } catch (error) {
    console.error("Gemini test error:", error);
    return res.status(500).json({
      error: "Failed to connect to Gemini AI",
      details: error.message,
    });
  }
});

// Multer error handling + general error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 10MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ error: "Too many files. Maximum is 10 files." });
    }
  }
  console.error("Unhandled error:", error);
  res.status(500).json({ error: error.message || "Internal server error" });
});

// Simple root
app.use("/", (req, res) => {
  res.status(200).json({ message: "hello backend is working" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check:  http://localhost:${PORT}/health`);
  console.log(`🧪 Test Gemini:   http://localhost:${PORT}/test-gemini`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/chat`);
  if (!apiKey) {
    console.log("⚠️  WARNING: GOOGLE_API_KEY / GEMINI_API_KEY not found");
  } else {
    console.log("✅ Gemini API key configured");
  }
});
