const express = require("express");
const { Worker } = require("worker_threads");
const path = require("path");
const Tesseract = require("tesseract.js");
const { db } = require("./database");

const router = express.Router();

// --- THE MULTI-CORE WORKER POOL ---
const NUM_CORES = 4; // The number of dedicated CPU cores for AI
const workers = [];
let currentWorkerIndex = 0;

// Boot up 4 separate brains on 4 separate CPU threads
for (let i = 0; i < NUM_CORES; i++) {
  const worker = new Worker(path.join(__dirname, "ai-worker.js"));

  worker.on("message", (msg) => {
   if (msg.type === "success") {
      // Write the new tags directly to the SQLite Database
      db.prepare("UPDATE Media SET tags = ? WHERE id = ?").run(
        msg.tags,
        msg.mediaId,
      );
    } else if (msg.type === "error") {
      console.error(`❌ [Core ${i + 1}] Error on ${msg.filename}:`, msg.error);
    }
  });
  workers.push(worker);
}

// Health Check Route
router.get("/status", (req, res) => {
  res.json({ message: `🧠 ${NUM_CORES}-Core AI Cluster is online.` });
});

// --- SMART OCR ENGINE ---
router.post("/ocr", async (req, res) => {
  const { filename } = req.body;
  if (!filename)
    return res.status(400).json({ error: "No filename provided." });

  const filePath = path.join(__dirname, "uploads", filename);

  try {
    console.log(`🧠 AI is reading text from ${filename}...`);
    const result = await Tesseract.recognize(filePath, "eng");
    const extractedText = result.data.text.trim();

    if (!extractedText) return res.json({ text: "No text detected." });
    res.json({ text: extractedText });
  } catch (error) {
    console.error("AI OCR Error:", error);
    res.status(500).json({ error: "Failed to process image." });
  }
});

// --- ROUND-ROBIN LOAD BALANCER ---
const autoTagImage = (mediaId, filename) => {
  // 1. Grab the next available worker core in the pool
  const worker = workers[currentWorkerIndex];

  // 2. Hand the heavy math off to this specific core
  worker.postMessage({ type: "tag", filename, mediaId });

  // 3. Move the pointer to the next core so the NEXT image goes to a different CPU thread
  // The '%' math guarantees it loops perfectly: 0 -> 1 -> 2 -> 0 -> 1 -> 2
  currentWorkerIndex = (currentWorkerIndex + 1) % NUM_CORES;
};

module.exports = { router, autoTagImage };
