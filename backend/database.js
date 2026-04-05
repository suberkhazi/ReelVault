const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "reelvault.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS User (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- The Folders Table
  -- parentId allows us to put folders inside of folders!
  CREATE TABLE IF NOT EXISTS Folder (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT,
    parentId TEXT, 
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ownerId) REFERENCES User(id),
    FOREIGN KEY(parentId) REFERENCES Folder(id)
  );

  -- The Media Table
  -- Now includes a folderId so every file knows where it lives.
CREATE TABLE IF NOT EXISTS Media (
    id TEXT PRIMARY KEY,
    filename TEXT,
    fileType TEXT,
    uploaderId TEXT,
    folderId TEXT, 
    latitude REAL,  
    longitude REAL, 
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    tags TEXT DEFAULT '', 
    FOREIGN KEY(uploaderId) REFERENCES User(id),
    FOREIGN KEY(folderId) REFERENCES Folder(id)
  );
  
  -- The Sharing Table
  -- This handles both your "Temporary Links" (expiresAt) and "Collaborative Folders"
  CREATE TABLE IF NOT EXISTS Share (
    id TEXT PRIMARY KEY,
    type TEXT, -- Is this sharing a 'folder' or 'media'?
    targetId TEXT, -- The ID of the specific folder or file
    sharedBy TEXT,
    sharedWith TEXT, -- If NULL, it's a public link. If it has a User ID, it's a private collab.
    expiresAt DATETIME, -- If NULL, it lasts forever. Otherwise, it self-destructs.
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sharedBy) REFERENCES User(id)
  );

  CREATE TABLE IF NOT EXISTS Shares (
        id TEXT PRIMARY KEY, itemId TEXT, itemType TEXT, 
        sharedBy TEXT, sharedWith TEXT, token TEXT
    );
`);

// function ensureTestUserExists() {
//   let testUser = db
//     .prepare("SELECT * FROM User WHERE username = ?")
//     .get("admin_test");

//   // 1. Create the user if they don't exist
//   if (!testUser) {
//     const newUserId = "user_" + Date.now();
//     db.prepare(
//       "INSERT INTO User (id, username, password) VALUES (?, ?, ?)",
//     ).run(newUserId, "admin_test", "supersecretpassword123");
//     testUser = db
//       .prepare("SELECT * FROM User WHERE username = ?")
//       .get("admin_test");
//     console.log("🛠️ Created Test User:", testUser.id);
//   }

//   // 2. NEW: Ensure the user has a "Root" folder (their main home screen)
//   let rootFolder = db
//     .prepare("SELECT * FROM Folder WHERE ownerId = ? AND parentId IS NULL")
//     .get(testUser.id);
//   if (!rootFolder) {
//     const newFolderId = "folder_" + Date.now();
//     db.prepare(
//       "INSERT INTO Folder (id, name, ownerId, parentId) VALUES (?, ?, ?, ?)",
//     ).run(newFolderId, "Root", testUser.id, null);
//     console.log("📁 Created Root Folder for Test User!");
//   }

//   return testUser;
// }

module.exports = {
  db, //ensureTestUserExists
};
