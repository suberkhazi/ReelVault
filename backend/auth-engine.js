const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("./database");

const router = express.Router();

const JWT_SECRET = "super-secret-reelvault-key";

// --- REGISTER A NEW USER ---
router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // 1. Check if the username is already taken
    const existingUser = db
      .prepare("SELECT * FROM User WHERE username = ?")
      .get(username);
    if (existingUser)
      return res.status(400).json({ error: "Username already exists" });

    // 2. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = "user_" + Date.now();

    // 3. Save the user
    db.prepare(
      "INSERT INTO User (id, username, password) VALUES (?, ?, ?)",
    ).run(userId, username, hashedPassword);

    // 4. Generate their personal "Root" folder so they have a home screen
    const rootId = "folder_" + Date.now();
    db.prepare(
      "INSERT INTO Folder (id, name, ownerId, parentId) VALUES (?, ?, ?, ?)",
    ).run(rootId, "Root", userId, null);

    console.log(`🔐 New user registered: ${username}`);
    res.json({ message: "Account created successfully!" });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// --LOGIN ---
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Find the user
    const user = db
      .prepare("SELECT * FROM User WHERE username = ?")
      .get(username);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    // 2. Check if the password matches the hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });
    // 3. Generate a JWT token for the session
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    console.log(`🔑 User logged in: ${username}`);
    res.json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
