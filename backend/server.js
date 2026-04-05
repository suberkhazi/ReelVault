const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const archiver = require("archiver");
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

// Internal Engines
const authEngine = require("./auth-engine");
const converterEngine = require("./converter-engine");
const { db } = require("./database");
const { router: aiRouter, autoTagImage } = require("./ai-engine");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- WEBSOCKET EVENT LISTENER ---
io.on("connection", (socket) => {
  socket.on("join_vault", (userId) => {
    socket.join(userId);
  });
});

// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://100.106.246.108:3000',
  'http://100.106.246.108:8081',
  'http://100.106.246.108:19006',
  'https://reel-vault-pi.vercel.app/',
];


app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Mount the Routers
app.use("/ai", aiRouter);
app.use("/auth", authEngine);
app.use("/tools", converterEngine);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

function requireUserId(req, res) {
  const { userId } = req.body;
  if (!userId) {
    res.status(401).json({ error: "Missing userId" });
    return null;
  }
  const user = db.prepare("SELECT id FROM User WHERE id = ?").get(userId);
  if (!user) {
    res.status(400).json({ error: "Invalid userId" });
    return null;
  }
  return userId;
}

app.use((req, res, next) => {
  console.log(`[NETWORK TRAFFIC] Method: ${req.method} | URL: ${req.url}`);
  next();
});

// --- BULLETPROOF UPLOAD ROUTE (WITH AI TOGGLE) ---
app.post("/upload", upload.single("mediaFile"), (req, res) => {
  let { uploaderId, folderId, enableAI } = req.body;
  const file = req.file;

  if (!file) return res.status(400).send("No file uploaded.");

  try {
    if (folderId === "null" || folderId === "undefined") folderId = null;
    if (uploaderId === "null" || uploaderId === "undefined") uploaderId = null;

    const userExists = db
      .prepare("SELECT id FROM User WHERE id = ?")
      .get(uploaderId);
    if (!userExists) return res.status(400).json({ error: "Invalid User ID." });

    let finalFolderId = folderId;
    if (!finalFolderId) {
      let root = db
        .prepare("SELECT id FROM Folder WHERE name = 'Root' AND ownerId = ?")
        .get(uploaderId);
      if (!root) {
        const newRootId = "folder_" + Date.now();
        db.prepare(
          "INSERT INTO Folder (id, name, ownerId, parentId) VALUES (?, 'Root', ?, NULL)",
        ).run(newRootId, uploaderId);
        finalFolderId = newRootId;
      } else {
        finalFolderId = root.id;
      }
    } else {
      const folderExists = db
        .prepare("SELECT id FROM Folder WHERE id = ?")
        .get(finalFolderId);
      if (!folderExists)
        return res.status(400).json({ error: "Invalid Folder ID." });
    }

    const mediaId = "media_" + Date.now();
    db.prepare(
      `
            INSERT INTO Media (id, filename, fileType, uploaderId, folderId) 
            VALUES (?, ?, ?, ?, ?)
        `,
    ).run(mediaId, file.filename, file.mimetype, uploaderId, finalFolderId);

    //Only wake up the AI if the phone explicitly asks for it!
    const isAiTurnedOn = enableAI === "true";

    if (isAiTurnedOn && file.mimetype && file.mimetype.startsWith("image/")) {
      console.log(`🧠 AI is ON: Queuing ${file.filename} for Vision Brain...`);
      setTimeout(() => {
        autoTagImage(mediaId, file.filename);
      }, 2000);
    } else if (
      !isAiTurnedOn &&
      file.mimetype &&
      file.mimetype.startsWith("image/")
    ) {
      console.log(`💤 AI is OFF: Skipping tagging for ${file.filename}.`);
    }

    io.to(uploaderId).emit("vault_updated");
    res.json({ message: "File vaulted successfully!", mediaId });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).send(error.message);
  }
});

// --- SECURE VAULT LOADING ENGINE ---
app.post("/load-vault", (req, res) => {
  const { folderId, userId } = req.body;
  if (!userId)
    return res
      .status(401)
      .json({ error: "Unauthorized: No user ID provided." });

  try {
    let currentFolderId = folderId;
    let targetOwnerId = userId;

    if (currentFolderId) {
      const folder = db
        .prepare("SELECT ownerId FROM Folder WHERE id = ?")
        .get(currentFolderId);
      if (folder && folder.ownerId !== userId) {
        const user = db
          .prepare("SELECT username FROM User WHERE id = ?")
          .get(userId);
        const isShared = db
          .prepare("SELECT id FROM Shares WHERE itemId = ? AND sharedWith = ?")
          .get(currentFolderId, user.username);

        if (isShared) {
          targetOwnerId = folder.ownerId;
        } else {
          currentFolderId = null;
        }
      }
    }

    if (!currentFolderId) {
      let rootFolder = db
        .prepare("SELECT id FROM Folder WHERE name = 'Root' AND ownerId = ?")
        .get(userId);
      if (!rootFolder) {
        const newRootId = "folder_" + Date.now();
        db.prepare(
          "INSERT INTO Folder (id, name, ownerId, parentId) VALUES (?, 'Root', ?, NULL)",
        ).run(newRootId, userId);
        currentFolderId = newRootId;
      } else {
        currentFolderId = rootFolder.id;
      }
      targetOwnerId = userId;
    }

    const folders = db
      .prepare("SELECT * FROM Folder WHERE parentId = ? AND ownerId = ?")
      .all(currentFolderId, targetOwnerId);
    const files = db
      .prepare("SELECT * FROM Media WHERE folderId = ? AND uploaderId = ?")
      .all(currentFolderId, targetOwnerId);

    res.json({ currentFolderId, folders, files });
  } catch (error) {
    console.error("Vault Load Error:", error);
    res.status(500).json({ error: "Failed to securely load vault." });
  }
});

// --- SECURE FOLDER CREATION ---
app.post("/create-folder", (req, res) => {
  let { name, parentId, userId } = req.body;
  if (!userId)
    return res.status(401).json({ error: "Unauthorized: Missing User ID." });

  try {
    let actualParentId = parentId;
    if (!actualParentId || actualParentId === "null") {
      const root = db
        .prepare("SELECT id FROM Folder WHERE name = 'Root' AND ownerId = ?")
        .get(userId);
      actualParentId = root ? root.id : null;
    }

    const newFolderId = "folder_" + Date.now();
    db.prepare(
      "INSERT INTO Folder (id, name, ownerId, parentId) VALUES (?, ?, ?, ?)",
    ).run(newFolderId, name, userId, actualParentId);

    io.to(userId).emit("vault_updated");
    res.json({ message: "Folder created successfully", folderId: newFolderId });
  } catch (error) {
    console.error("Create Folder Error:", error);
    res.status(500).json({ error: "Failed to create folder." });
  }
});

app.post("/save-text", (req, res) => {
  try {
    const { filename, content } = req.body;
    const targetPath = path.join(__dirname, "uploads", filename);
    fs.writeFileSync(targetPath, content, "utf8");
    res.json({ message: "File safely overwritten!" });
  } catch (error) {
    res.status(500).send("Failed to save text file.");
  }
});

app.post("/overwrite-media", upload.single("mediaFile"), (req, res) => {
  try {
    const { originalFilename } = req.body;
    const targetPath = path.join(__dirname, "uploads", originalFilename);
    fs.renameSync(req.file.path, targetPath);
    res.json({ message: "File successfully overwritten!" });
  } catch (error) {
    res.status(500).send("Failed to overwrite file.");
  }
});

// --- ZIP COMPRESSION & EXTRACTION ---
app.post("/compress", (req, res) => {
  try {
    const { targetName, isFolder, itemId, currentFolderId, userId } = req.body;
    if (!userId) return res.status(401).json({ error: "Missing userId" });

    const userExists = db
      .prepare("SELECT id FROM User WHERE id = ?")
      .get(userId);
    if (!userExists) return res.status(400).json({ error: "Invalid userId" });

    const zip = new AdmZip();

    const safeName = targetName.replace(/[^a-zA-Z0-9-]/g, "_");
    const zipFilename = Date.now() + "-" + safeName + ".zip";
    const zipPath = path.join(__dirname, "uploads", zipFilename);

    if (isFolder) {
      const files = db
        .prepare("SELECT filename FROM Media WHERE folderId = ?")
        .all(itemId);
      if (files.length === 0)
        return res
          .status(400)
          .json({ error: "Cannot compress an empty folder." });

      files.forEach((f) => {
        const filePath = path.join(__dirname, "uploads", f.filename);
        if (fs.existsSync(filePath)) zip.addLocalFile(filePath, "");
      });
    } else {
      const targetPath = path.join(__dirname, "uploads", targetName);
      if (!fs.existsSync(targetPath))
        return res.status(404).json({ error: "File not found" });
      zip.addLocalFile(targetPath);
    }

    zip.writeZip(zipPath);

    const mediaId = "media_" + Date.now();
    db.prepare(
      "INSERT INTO Media (id, filename, fileType, uploaderId, folderId) VALUES (?, ?, ?, ?, ?)",
    ).run(mediaId, zipFilename, "application/zip", userId, currentFolderId);
    io.to(userId).emit("vault_updated");

    res.json({ message: "Compression complete" });
  } catch (error) {
    res.status(500).json({ error: "Failed to compress target" });
  }
});

app.post("/extract", (req, res) => {
  try {
    const { filename, currentFolderId, userId } = req.body;
    if (!userId) return res.status(401).json({ error: "Missing userId" });

    const userExists = db
      .prepare("SELECT id FROM User WHERE id = ?")
      .get(userId);
    if (!userExists) return res.status(400).json({ error: "Invalid userId" });
    const zipPath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(zipPath))
      return res.status(404).json({ error: "ZIP not found" });

    const cleanName =
      filename.split("-").slice(1).join("-").replace(".zip", "") ||
      "Extracted Archive";
    const newFolderId = "folder_" + Date.now();
    db.prepare(
      "INSERT INTO Folder (id, name, ownerId, parentId) VALUES (?, ?, ?, ?)",
    ).run(newFolderId, cleanName, userId, currentFolderId);

    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    zipEntries.forEach((zipEntry) => {
      if (!zipEntry.isDirectory) {
        const cleanOriginalName = zipEntry.name.includes("-")
          ? zipEntry.name.split("-").slice(1).join("-")
          : zipEntry.name;
        const extractedFilename = Date.now() + "-" + cleanOriginalName;
        const targetPath = path.join(__dirname, "uploads", extractedFilename);
        fs.writeFileSync(targetPath, zipEntry.getData());

        let ext = cleanOriginalName.split(".").pop().toLowerCase();
        let fileType = "application/octet-stream";

        if (ext === "jpg" || ext === "jpeg") fileType = "image/jpeg";
        if (ext === "png") fileType = "image/png";
        if (ext === "mp4") fileType = "video/mp4";
        if (ext === "txt") fileType = "text/plain";
        if (ext === "pdf") fileType = "application/pdf";
        if (ext === "zip") fileType = "application/zip";
        if (ext === "doc" || ext === "docx") fileType = "application/msword";

        const mediaId =
          "media_" + Date.now() + Math.floor(Math.random() * 1000);
        db.prepare(
          "INSERT INTO Media (id, filename, fileType, uploaderId, folderId) VALUES (?, ?, ?, ?, ?)",
        ).run(mediaId, extractedFilename, fileType, userId, newFolderId);
      }
    });
    io.to(userId).emit("vault_updated");
    res.json({ message: "Extraction complete" });
  } catch (error) {
    res.status(500).json({ error: "Failed to extract ZIP" });
  }
});

// --- FILE OPERATIONS ---
app.post("/delete", (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { itemId, isFolder, filename } = req.body;

    if (isFolder) {
      const folder = db
        .prepare("SELECT id FROM Folder WHERE id = ? AND ownerId = ?")
        .get(itemId, userId);
      if (!folder)
        return res
          .status(404)
          .json({ error: "Folder not found or not owned by user." });

      const files = db
        .prepare(
          "SELECT id, filename FROM Media WHERE folderId = ? AND uploaderId = ?",
        )
        .all(itemId, userId);
      files.forEach((f) => {
        const filePath = path.join(__dirname, "uploads", f.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });

      db.prepare("DELETE FROM Media WHERE folderId = ? AND uploaderId = ?").run(
        itemId,
        userId,
      );
      db.prepare("DELETE FROM Folder WHERE id = ? AND ownerId = ?").run(
        itemId,
        userId,
      );
    } else {
      const media = db
        .prepare("SELECT filename FROM Media WHERE id = ? AND uploaderId = ?")
        .get(itemId, userId);
      if (!media)
        return res
          .status(404)
          .json({ error: "File not found or not owned by user." });

      const filePath = path.join(
        __dirname,
        "uploads",
        media.filename || filename,
      );
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      db.prepare("DELETE FROM Media WHERE id = ? AND uploaderId = ?").run(
        itemId,
        userId,
      );
    }

    io.to(userId).emit("vault_updated");
    res.json({ message: "Successfully deleted" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

app.post("/bulk-delete", (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { itemIds } = req.body;
  if (!itemIds || itemIds.length === 0) return res.json({ success: true });

  try {
    const placeholders = itemIds.map(() => "?").join(",");

    const ownedFiles = db
      .prepare(
        `SELECT filename FROM Media WHERE id IN (${placeholders}) AND uploaderId = ?`,
      )
      .all(...itemIds, userId);
    ownedFiles.forEach((f) => {
      const filePath = path.join(__dirname, "uploads", f.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    db.prepare(
      `DELETE FROM Media WHERE id IN (${placeholders}) AND uploaderId = ?`,
    ).run(...itemIds, userId);
    db.prepare(
      `DELETE FROM Folder WHERE id IN (${placeholders}) AND ownerId = ?`,
    ).run(...itemIds, userId);

    io.to(userId).emit("vault_updated");
    res.json({ message: `Deleted ${itemIds.length} items.` });
  } catch (error) {
    console.error("Bulk Delete Error:", error);
    res.status(500).json({ error: "Failed to delete items." });
  }
});

app.post("/rename", (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { itemId, isFolder, oldName, newName } = req.body;

    if (isFolder) {
      const info = db
        .prepare("UPDATE Folder SET name = ? WHERE id = ? AND ownerId = ?")
        .run(newName, itemId, userId);
      if (info.changes === 0)
        return res
          .status(404)
          .json({ error: "Folder not found or not owned by user." });
    } else {
      const media = db
        .prepare("SELECT filename FROM Media WHERE id = ? AND uploaderId = ?")
        .get(itemId, userId);
      if (!media)
        return res
          .status(404)
          .json({ error: "File not found or not owned by user." });

      const actualOldName = media.filename || oldName;
      const ext = actualOldName.split(".").pop();
      const prefix = actualOldName.split("-")[0];
      const safeNewName = newName.replace(/[^a-zA-Z0-9_-]/g, "_");
      const newFilename = `${prefix}-${safeNewName}.${ext}`;

      const oldPath = path.join(__dirname, "uploads", actualOldName);
      const newPath = path.join(__dirname, "uploads", newFilename);

      if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
      db.prepare(
        "UPDATE Media SET filename = ? WHERE id = ? AND uploaderId = ?",
      ).run(newFilename, itemId, userId);
    }

    io.to(userId).emit("vault_updated");
    res.json({ message: "Renamed successfully" });
  } catch (error) {
    console.error("Rename Error:", error);
    res.status(500).json({ error: "Failed to rename" });
  }
});

app.post("/copy", (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { itemId, isFolder } = req.body;
    let { destinationFolderId } = req.body;

    if (isFolder)
      return res.status(400).json({ error: "Folder duplication coming soon." });

    const oldRecord = db
      .prepare("SELECT * FROM Media WHERE id = ? AND uploaderId = ?")
      .get(itemId, userId);
    if (!oldRecord)
      return res
        .status(404)
        .json({ error: "File not found or not owned by user." });

    if (!destinationFolderId) {
      const root = db
        .prepare("SELECT id FROM Folder WHERE ownerId = ? AND parentId IS NULL")
        .get(userId);
      destinationFolderId = root?.id;
    } else {
      const dest = db
        .prepare("SELECT id FROM Folder WHERE id = ? AND ownerId = ?")
        .get(destinationFolderId, userId);
      if (!dest)
        return res.status(400).json({ error: "Invalid destination folder." });
    }

    const oldPath = path.join(__dirname, "uploads", oldRecord.filename);
    if (!fs.existsSync(oldPath))
      return res.status(404).json({ error: "File not found on disk" });

    const originalName = oldRecord.filename.substring(
      oldRecord.filename.indexOf("-") + 1,
    );
    const newFilename = Date.now() + "-Copy_of_" + originalName;
    const newPath = path.join(__dirname, "uploads", newFilename);
    fs.copyFileSync(oldPath, newPath);

    const newMediaId = "media_" + Date.now();
    db.prepare(
      "INSERT INTO Media (id, filename, fileType, uploaderId, folderId) VALUES (?, ?, ?, ?, ?)",
    ).run(
      newMediaId,
      newFilename,
      oldRecord.fileType,
      userId,
      destinationFolderId,
    );

    io.to(userId).emit("vault_updated");
    res.json({ message: "Copied successfully to destination" });
  } catch (error) {
    console.error("Copy Error:", error);
    res.status(500).json({ error: "Failed to copy" });
  }
});

app.post("/move", (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { itemId, isFolder } = req.body;
    let { destinationFolderId } = req.body;

    if (!destinationFolderId) {
      const root = db
        .prepare("SELECT id FROM Folder WHERE ownerId = ? AND parentId IS NULL")
        .get(userId);
      destinationFolderId = root?.id;
    } else {
      const dest = db
        .prepare("SELECT id FROM Folder WHERE id = ? AND ownerId = ?")
        .get(destinationFolderId, userId);
      if (!dest)
        return res.status(400).json({ error: "Invalid destination folder." });
    }

    if (isFolder && itemId === destinationFolderId) {
      return res
        .status(400)
        .json({ error: "Cannot move a folder into itself." });
    }

    if (isFolder) {
      const info = db
        .prepare("UPDATE Folder SET parentId = ? WHERE id = ? AND ownerId = ?")
        .run(destinationFolderId, itemId, userId);
      if (info.changes === 0)
        return res
          .status(404)
          .json({ error: "Folder not found or not owned by user." });
    } else {
      const info = db
        .prepare(
          "UPDATE Media SET folderId = ? WHERE id = ? AND uploaderId = ?",
        )
        .run(destinationFolderId, itemId, userId);
      if (info.changes === 0)
        return res
          .status(404)
          .json({ error: "File not found or not owned by user." });
    }

    io.to(userId).emit("vault_updated");
    res.json({ message: "Moved successfully" });
  } catch (error) {
    console.error("Move Error:", error);
    res.status(500).json({ error: "Failed to move" });
  }
});

app.post("/bulk-move", (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  let { itemIds, destinationFolderId } = req.body;
  if (!itemIds || itemIds.length === 0) return res.json({ success: true });

  try {
    if (!destinationFolderId) {
      const root = db
        .prepare("SELECT id FROM Folder WHERE ownerId = ? AND parentId IS NULL")
        .get(userId);
      destinationFolderId = root?.id;
    } else {
      const dest = db
        .prepare("SELECT id FROM Folder WHERE id = ? AND ownerId = ?")
        .get(destinationFolderId, userId);
      if (!dest)
        return res.status(400).json({ error: "Invalid destination folder." });
    }

    const placeholders = itemIds.map(() => "?").join(",");
    db.prepare(
      `UPDATE Media SET folderId = ? WHERE id IN (${placeholders}) AND uploaderId = ?`,
    ).run(destinationFolderId, ...itemIds, userId);
    db.prepare(
      `UPDATE Folder SET parentId = ? WHERE id IN (${placeholders}) AND ownerId = ?`,
    ).run(destinationFolderId, ...itemIds, userId);

    io.to(userId).emit("vault_updated");
    res.json({ message: `Moved ${itemIds.length} items successfully.` });
  } catch (error) {
    console.error("Bulk Move Error:", error);
    res.status(500).json({ error: "Failed to move items." });
  }
});

app.post("/create-document", (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { filename, content, currentFolderId } = req.body;

    const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".txt";
    const finalFilename = Date.now() + "-" + safeName;
    const targetPath = path.join(__dirname, "uploads", finalFilename);

    fs.writeFileSync(targetPath, content, "utf8");

    const mediaId = "media_" + Date.now();
    db.prepare(
      "INSERT INTO Media (id, filename, fileType, uploaderId, folderId) VALUES (?, ?, ?, ?, ?)",
    ).run(mediaId, finalFilename, "text/plain", userId, currentFolderId);

    io.to(userId).emit("vault_updated");
    res.json({ message: "Document created successfully!" });
  } catch (error) {
    console.error("Create Document Error:", error);
    res.status(500).json({ error: "Failed to create document" });
  }
});

// --- SEARCH & DATA RETRIEVAL ---
app.get("/search", (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ files: [] });

  try {
    const searchPattern = `%${query.toLowerCase()}%`;
    const files = db
      .prepare(
        `
            SELECT * FROM Media 
            WHERE LOWER(tags) LIKE ? OR LOWER(filename) LIKE ?
            ORDER BY createdAt DESC
        `,
      )
      .all(searchPattern, searchPattern);

    const formattedFiles = files.map((f) => ({ ...f, type: "file" }));
    res.json({ files: formattedFiles });
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/folders", (req, res) => {
  try {
    const folders = db
      .prepare("SELECT id, name FROM Folder WHERE name != 'Root'")
      .all();
    res.json({ folders });
  } catch (error) {
    res.json({ folders: [] });
  }
});

// --- SHARING ENGINE ---
app.post("/share", (req, res) => {
  const { itemId, itemType, sharedBy, targetUsername } = req.body;
  const token = Math.random().toString(36).substring(2, 15);
  const sharedWith = targetUsername ? targetUsername : "PUBLIC";

  db.prepare(
    `INSERT INTO Shares (id, itemId, itemType, sharedBy, sharedWith, token) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("share_" + Date.now(), itemId, itemType, sharedBy, sharedWith, token);

  if (sharedWith === "PUBLIC") {
    res.json({ link: `${BASE_URL}/public/${token}` });
  } else {
    if (targetUsername) {
      const targetUser = db
        .prepare("SELECT id FROM User WHERE username = ?")
        .get(targetUsername);
      if (targetUser) io.to(targetUser.id).emit("vault_updated");
    }
    res.json({ message: `Shared securely with ${targetUsername}!` });
  }
});

app.get("/public/:token", (req, res) => {
  const share = db
    .prepare("SELECT itemId FROM Shares WHERE token = ?")
    .get(req.params.token);
  if (!share) return res.status(404).send("Link invalid or expired.");

  const file = db
    .prepare("SELECT filename FROM Media WHERE id = ?")
    .get(share.itemId);
  if (!file) return res.status(404).send("File not found.");

  res.redirect(`/uploads/${file.filename}`);
});

app.get("/shared-with-me/:username", (req, res) => {
  try {
    const sharedItems = db
      .prepare(
        `
            SELECT s.id as shareId, s.itemId, s.itemType, s.sharedBy,
                   u.username as sharedByUsername,
                   m.filename, m.fileType,
                   f.name as folderName
            FROM Shares s
            JOIN User u ON s.sharedBy = u.id
            LEFT JOIN Media m ON s.itemId = m.id AND s.itemType = 'file'
            LEFT JOIN Folder f ON s.itemId = f.id AND s.itemType = 'folder'
            WHERE s.sharedWith = ?
            GROUP BY s.itemId 
        `,
      )
      .all(req.params.username);

    res.json(sharedItems);
  } catch (error) {
    res.status(500).json({ error: "Failed to load shared items." });
  }
});

// --- FOLDER DOWNLOAD ENGINE --- only works in web
app.get("/download-folder/:folderId/:userId", (req, res) => {
  const { folderId } = req.params;

  try {
    const folder = db
      .prepare("SELECT name FROM Folder WHERE id = ?")
      .get(folderId);
    if (!folder) return res.status(404).send("Folder not found.");

    const files = db
      .prepare("SELECT filename FROM Media WHERE folderId = ?")
      .all(folderId);
    if (files.length === 0) return res.status(400).send("Folder is empty.");

    res.attachment(`${folder.name}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    files.forEach((file) => {
      const filePath = path.join(__dirname, "uploads", file.filename);
      archive.file(filePath, { name: file.filename });
    });

    archive.finalize();
  } catch (error) {
    res.status(500).send("Failed to zip folder.");
  }
});

// ===== ADMIN ROUTES =====

// Get all users
app.get("/admin/users", (req, res) => {
  try {
    const users = db.prepare("SELECT id, username, createdAt FROM User").all();
    res.json(users);
  } catch (error) {
    console.error("Error in /admin/users:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all files with file size
app.get("/admin/files", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");

    const files = db
      .prepare(
        `SELECT m.id, m.filename, m.fileType, m.createdAt, u.username as uploaderUsername, m.uploaderId
         FROM Media m 
         LEFT JOIN User u ON m.uploaderId = u.id`,
      )
      .all();

    const filesWithSize = files.map((file) => {
      const filePath = path.join(__dirname, "uploads", file.filename);
      let fileSize = 0;
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          fileSize = stat.size;
        }
      } catch (e) {
        console.log("Could not get size for:", file.filename);
      }
      return { ...file, fileSize };
    });

    res.json(filesWithSize);
  } catch (error) {
    console.error("Error in /admin/files:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's files
app.get("/admin/users/:userId/files", (req, res) => {
  try {
    const { userId } = req.params;
    const fs = require("fs");
    const path = require("path");

    const files = db
      .prepare(
        `SELECT id, filename, fileType, createdAt, uploaderId FROM Media WHERE uploaderId = ?`,
      )
      .all(userId);

    const filesWithSize = files.map((file) => {
      const filePath = path.join(__dirname, "uploads", file.filename);
      let fileSize = 0;
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          fileSize = stat.size;
        }
      } catch (e) {
        console.log("Could not get size for:", file.filename);
      }
      return { ...file, fileSize };
    });

    res.json(filesWithSize);
  } catch (error) {
    console.error("Error in /admin/users/:userId/files:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get stats
app.get("/admin/stats", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");

    const totalUsersResult = db
      .prepare("SELECT COUNT(*) as count FROM User")
      .get();
    const totalUsers = totalUsersResult ? totalUsersResult.count : 0;

    const totalFilesResult = db
      .prepare("SELECT COUNT(*) as count FROM Media")
      .get();
    const totalFiles = totalFilesResult ? totalFilesResult.count : 0;

    const totalFoldersResult = db
      .prepare("SELECT COUNT(*) as count FROM Folder")
      .get();
    const totalFolders = totalFoldersResult ? totalFoldersResult.count : 0;

    const activeSharesResult = db
      .prepare(`SELECT COUNT(*) as count FROM Share`)
      .get();
    const activeShares = activeSharesResult ? activeSharesResult.count : 0;

    let totalSize = 0;
    const uploadsDir = path.join(__dirname, "uploads");

    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir);

        files.forEach((file) => {
          try {
            const filePath = path.join(uploadsDir, file);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              totalSize += stat.size;
            }
          } catch (e) {
            console.log("Could not stat file:", file, e.message);
          }
        });
      } catch (e) {
        console.error("Error reading uploads dir:", e);
      }
    }

    console.log("Total size:", totalSize);

    const response = {
      totalUsers,
      totalFiles,
      totalFolders,
      activeShares,
      totalSize,
    };

    res.json(response);
  } catch (error) {
    console.error("Error in /admin/stats:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all shares
app.get("/admin/shares", (req, res) => {
  try {
    const shares = db.prepare("SELECT * FROM Share").all();
    res.json(shares);
  } catch (error) {
    console.error("Error in /admin/shares:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user and all their files
app.delete("/admin/users/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    const fs = require("fs");
    const path = require("path");

    // Get all files of user
    const files = db
      .prepare("SELECT filename FROM Media WHERE uploaderId = ?")
      .all(userId);

    // Delete files from disk
    files.forEach((file) => {
      const filePath = path.join(__dirname, "uploads", file.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log("Deleted file:", file.filename);
        } catch (e) {
          console.log("Could not delete file:", file.filename, e);
        }
      }
    });

    // Delete from database
    db.prepare("DELETE FROM Media WHERE uploaderId = ?").run(userId);
    db.prepare("DELETE FROM Folder WHERE ownerId = ?").run(userId);
    db.prepare("DELETE FROM Share WHERE sharedBy = ?").run(userId);
    db.prepare("DELETE FROM Shares WHERE sharedBy = ?").run(userId);
    db.prepare("DELETE FROM User WHERE id = ?").run(userId);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /admin/users/:userId:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete single file
app.delete("/admin/files/:fileId", (req, res) => {
  try {
    const { fileId } = req.params;
    const { filename } = req.body;

    const fs = require("fs");
    const path = require("path");

    console.log("Deleting file:", fileId, filename);

    // Delete from disk
    if (filename) {
      const filePath = path.join(__dirname, "uploads", filename);
      console.log("File path:", filePath);
      console.log("File exists:", fs.existsSync(filePath));

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log("Deleted from disk:", filename);
        } catch (e) {
          console.error("Error deleting from disk:", e);
        }
      }
    }

    // Delete from database
    db.prepare("DELETE FROM Media WHERE id = ?").run(fileId);
    db.prepare("DELETE FROM Share WHERE targetId = ?").run(fileId);

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /admin/files/:fileId:", error);
    res.status(500).json({ error: error.message });
  }
});

// Revoke share
app.delete("/admin/shares/:shareId", (req, res) => {
  try {
    const { shareId } = req.params;
    db.prepare("DELETE FROM Share WHERE id = ?").run(shareId);
    res.json({ message: "Share revoked successfully" });
  } catch (error) {
    console.error("Error in DELETE /admin/shares/:shareId:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- STARTUP ---
const PORT = 4000;
server.listen(PORT, () => {
  console.log(`🚀 ReelVault Server listening on port ${PORT}`);
});
