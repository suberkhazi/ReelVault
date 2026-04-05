const express = require("express");
const { PDFDocument } = require("pdf-lib");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { db } = require("./database");

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, "uploads");

// --- 1. JPG/PNG to PDF ---
router.post("/images-to-pdf", async (req, res) => {
  const { filenames, outputName, mediaId, uploaderId, folderId } = req.body;

  try {
    const pdfDoc = await PDFDocument.create();

    for (const filename of filenames) {
      const imgPath = path.join(UPLOADS_DIR, filename);
      const imgBytes = await fs.promises.readFile(imgPath);

      let image;
      if (filename.toLowerCase().endsWith(".png")) {
        image = await pdfDoc.embedPng(imgBytes);
      } else {
        image = await pdfDoc.embedJpg(imgBytes);
      }

      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const finalFilename = `media_${Date.now()}-${outputName}.pdf`;

    await fs.promises.writeFile(
      path.join(UPLOADS_DIR, finalFilename),
      pdfBytes,
    );

    // Save the new PDF to the database
    db.prepare(
      `
            INSERT INTO Media (id, filename, fileType, uploaderId, folderId) 
            VALUES (?, ?, ?, ?, ?)
        `,
    ).run(mediaId, finalFilename, "application/pdf", uploaderId, folderId);

    res.json({ message: "PDF created successfully!", filename: finalFilename });
  } catch (error) {
    console.error("PDF Creation Error:", error);
    res.status(500).json({ error: "Failed to create PDF" });
  }
});

// PDF to JPG (Using native Linux Poppler) ---
router.post("/pdf-to-images", (req, res) => {
  const { filename, uploaderId, folderId } = req.body;
  const inputPath = path.join(UPLOADS_DIR, filename);
  const outputPrefix = path.join(UPLOADS_DIR, `extracted_${Date.now()}`);

  // pdftoppm is a native Linux tool. -jpeg tells it to output JPGs.
  const command = `pdftoppm -jpeg "${inputPath}" "${outputPrefix}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error("Poppler extraction failed:", error);
      return res.status(500).json({ error: "Failed to extract images." });
    }

    // Scan the uploads folder for the newly generated images
    const files = fs.readdirSync(UPLOADS_DIR);
    const generatedImages = files.filter((f) =>
      f.startsWith(path.basename(outputPrefix)),
    );

    // Save each new page as an image in the database
    const insertStmt = db.prepare(`
            INSERT INTO Media (id, filename, fileType, uploaderId, folderId) 
            VALUES (?, ?, ?, ?, ?)
        `);

    generatedImages.forEach((imgName, index) => {
      insertStmt.run(
        `media_${Date.now()}_${index}`,
        imgName,
        "image/jpeg",
        uploaderId,
        folderId,
      );
    });

    res.json({
      message: `Extracted ${generatedImages.length} pages to images!`,
      count: generatedImages.length,
    });
  });
});

module.exports = router;
