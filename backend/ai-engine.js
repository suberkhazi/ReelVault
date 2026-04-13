const express = require("express");
const { Worker } = require("worker_threads");
const path = require("path");
const { db } = require("./database");

const router = express.Router();

const NUM_CORES = 4;
let workers = [];
let currentWorkerIndex = 0;
let workersStarted = false;

// Only boot workers when actually needed
function ensureWorkersStarted() {
  if (workersStarted) return;
  workersStarted = true;
  console.log("🧠 Booting AI worker pool on demand...");
  for (let i = 0; i < NUM_CORES; i++) {
    const worker = new Worker(path.join(__dirname, "ai-worker.js"));
    worker.on("message", (msg) => {
      if (msg.type === "success") {
        db.prepare("UPDATE Media SET tags = ? WHERE id = ?").run(msg.tags, msg.mediaId);
      } else if (msg.type === "error") {
        console.error(`❌ [Core ${i + 1}] Error on ${msg.filename}:`, msg.error);
      }
    });
    workers.push(worker);
  }
}

// Lazy load Tesseract only when OCR is called
router.get("/status", (req, res) => {
  res.json({ message: `🧠 ${NUM_CORES}-Core AI Cluster is ready (lazy).` });
});

router.post("/ocr", async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "No filename provided." });

  const filePath = path.join(__dirname, "uploads", filename);
  try {
    console.log(`🧠 AI is reading text from ${filename}...`);
    const Tesseract = require("tesseract.js");
    const result = await Tesseract.recognize(filePath, "eng");
    const extractedText = result.data.text.trim();
    if (!extractedText) return res.json({ text: "No text detected." });
    res.json({ text: extractedText });
  } catch (error) {
    console.error("AI OCR Error:", error);
    res.status(500).json({ error: "Failed to process image." });
  }
});

const autoTagImage = (mediaId, filename) => {
  ensureWorkersStarted();
  const worker = workers[currentWorkerIndex];
  worker.postMessage({ type: "tag", filename, mediaId });
  currentWorkerIndex = (currentWorkerIndex + 1) % NUM_CORES;
};

module.exports = { router, autoTagImage };