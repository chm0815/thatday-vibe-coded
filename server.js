const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "thatday-secret-change-me";
const SALT_ROUNDS = 10;
const APP_ENV = process.env.APP_ENV || "dev";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// SMTP config for prod email sending (optional — falls back to console logging)
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "noreply@thatday.app";

let mailTransport = null;
if (APP_ENV === "prod" && SMTP_HOST && SMTP_USER && SMTP_PASS) {
  mailTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const DATA_DIR = path.join(__dirname, "data");
const USERS_DIR = path.join(DATA_DIR, "users");
const ENTRIES_DIR = path.join(DATA_DIR, "entries");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Ensure directories exist
[DATA_DIR, USERS_DIR, ENTRIES_DIR, UPLOADS_DIR].forEach((dir) =>
  fs.mkdirSync(dir, { recursive: true })
);

// Multer config — store in memory so sharp can process before saving
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpg, png, gif, webp)"));
    }
  },
});

// Multer config for video uploads — disk storage, 50 MB limit
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|mov|webm|avi|mkv)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed (mp4, mov, webm, avi, mkv)"));
    }
  },
});

// Combined upload for entries that accept both photo and video
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const imageAllowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    const videoAllowed = /\.(mp4|mov|webm|avi|mkv)$/i;
    if (imageAllowed.test(path.extname(file.originalname)) || videoAllowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image (jpg, png, gif, webp) and video (mp4, mov, webm) files are allowed"));
    }
  },
});

const MAX_BYTES = 500 * 1024; // 500 KB

/**
 * Process an uploaded photo buffer: resize/compress to fit under 500 KB.
 * Saves as JPEG into uploads/<userId>/ and returns the relative path.
 */
async function processPhoto(buffer, userId) {
  const userUploadsDir = path.join(UPLOADS_DIR, userId);
  fs.mkdirSync(userUploadsDir, { recursive: true });

  const filename = `${uuidv4()}.jpg`;
  const relativePath = `${userId}/${filename}`;
  const outputPath = path.join(UPLOADS_DIR, relativePath);

  const qualities = [65, 50, 40, 30, 20];
  const maxWidths = [1800, 1400, 1000, 800, 600];

  for (const quality of qualities) {
    const result = await sharp(buffer)
      .rotate()
      .jpeg({ quality })
      .toBuffer();
    if (result.length <= MAX_BYTES) {
      fs.writeFileSync(outputPath, result);
      return relativePath;
    }
  }

  for (const width of maxWidths) {
    for (const quality of qualities) {
      const result = await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      if (result.length <= MAX_BYTES) {
        fs.writeFileSync(outputPath, result);
        return relativePath;
      }
    }
  }

  const result = await sharp(buffer)
    .rotate()
    .resize({ width: 400, withoutEnlargement: true })
    .jpeg({ quality: 20 })
    .toBuffer();
  fs.writeFileSync(outputPath, result);
  return relativePath;
}

/**
 * Save an uploaded video buffer to uploads/<userId>/ and return the relative path.
 * Videos are stored as-is (no transcoding).
 */
function saveVideo(buffer, originalname, userId) {
  const userUploadsDir = path.join(UPLOADS_DIR, userId);
  fs.mkdirSync(userUploadsDir, { recursive: true });

  const ext = path.extname(originalname).toLowerCase() || ".mp4";
  const filename = `${uuidv4()}${ext}`;
  const relativePath = `${userId}/${filename}`;
  const outputPath = path.join(UPLOADS_DIR, relativePath);

  fs.writeFileSync(outputPath, buffer);
  return relativePath;
}

// --- Middleware ---

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
// Authenticated photo serving — only the owner can access their photos
app.get("/uploads/:userId/:filename", (req, res) => {
  // Accept token from query param (for <img src=""> usage) or Authorization header
  const token =
    req.query.token ||
    (req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ") &&
      req.headers.authorization.split(" ")[1]);

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Ensure user can only access their own photos
  if (payload.userId !== req.params.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Prevent path traversal
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, req.params.userId, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  // Determine content type from extension
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";

  res.set({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  res.sendFile(filePath);
});

// --- User helpers ---

function getUserFilePath(userId) {
  return path.join(USERS_DIR, `${userId}.json`);
}

function findUserByEmail(email) {
  const files = fs.readdirSync(USERS_DIR);
  for (const file of files) {
    const user = JSON.parse(
      fs.readFileSync(path.join(USERS_DIR, file), "utf-8")
    );
    if (user.email === email) return user;
  }
  return null;
}

function findUserByConfirmToken(token) {
  const files = fs.readdirSync(USERS_DIR);
  for (const file of files) {
    const user = JSON.parse(
      fs.readFileSync(path.join(USERS_DIR, file), "utf-8")
    );
    if (user.confirmToken === token) return user;
  }
  return null;
}

function saveUser(user) {
  fs.writeFileSync(getUserFilePath(user.id), JSON.stringify(user, null, 2));
}

/**
 * Send (or log) the confirmation email for a newly registered user.
 */
async function sendConfirmationEmail(user) {
  const confirmUrl = `${BASE_URL}/api/auth/confirm/${user.confirmToken}`;

  if (APP_ENV === "dev" || !mailTransport) {
    console.log(`\n[DEV] Confirmation link for ${user.email}:\n  ${confirmUrl}\n`);
    return;
  }

  await mailTransport.sendMail({
    from: SMTP_FROM,
    to: user.email,
    subject: "Confirm your thatday account",
    text: `Hi ${user.name},\n\nPlease confirm your account by visiting:\n${confirmUrl}\n\nThis link does not expire.\n\n— thatday`,
    html: `<p>Hi ${user.name},</p><p>Please confirm your account by clicking the link below:</p><p><a href="${confirmUrl}">Confirm my account</a></p><p>— thatday</p>`,
  });
}

// --- Entry helpers (per user) ---

function getEntriesFilePath(userId) {
  return path.join(ENTRIES_DIR, `${userId}.json`);
}

function readEntries(userId) {
  const filePath = getEntriesFilePath(userId);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeEntries(userId, entries) {
  fs.writeFileSync(getEntriesFilePath(userId), JSON.stringify(entries, null, 2));
}

// --- Auth middleware ---

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- Auth Routes ---

app.post("/api/auth/register", async (req, res) => {
  const { email, name, password } = req.body;

  if (!email || !name || !password) {
    return res
      .status(400)
      .json({ error: "Email, name, and password are required" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }

  if (findUserByEmail(email)) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = {
    id: uuidv4(),
    email,
    name,
    password: hashedPassword,
    confirmed: false,
    confirmToken: uuidv4(),
    createdAt: new Date().toISOString(),
  };

  saveUser(user);

  try {
    await sendConfirmationEmail(user);
  } catch (err) {
    console.error("Failed to send confirmation email:", err.message);
  }

  res.status(201).json({
    message: "Account created. Please check your email to confirm your account.",
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (user.confirmed === false) {
    return res
      .status(403)
      .json({ error: "Please confirm your email address before logging in" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
    expiresIn: "30d",
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// Get current user info
app.get("/api/auth/me", authenticate, (req, res) => {
  const filePath = getUserFilePath(req.userId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "User not found" });
  }
  const user = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  res.json({ id: user.id, email: user.email, name: user.name });
});

// Confirm email address
app.get("/api/auth/confirm/:token", (req, res) => {
  const user = findUserByConfirmToken(req.params.token);

  if (!user) {
    return res.redirect("/confirm.html?status=invalid");
  }

  if (user.confirmed) {
    return res.redirect("/confirm.html?status=already");
  }

  user.confirmed = true;
  delete user.confirmToken;
  saveUser(user);

  res.redirect("/confirm.html?status=success");
});

// --- Entry Routes (all authenticated) ---

// Get all entries for the logged-in user
app.get("/api/entries", authenticate, (req, res) => {
  const entries = readEntries(req.userId);
  entries.sort((a, b) => b.date.localeCompare(a.date));
  res.json(entries);
});

// Create a new entry
app.post(
  "/api/entries",
  authenticate,
  mediaUpload.fields([
    { name: "photo", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    const { headline, date } = req.body;

    if (!headline || !date) {
      return res
        .status(400)
        .json({ error: "Headline and date are required" });
    }

    if (headline.length > 300) {
      return res
        .status(400)
        .json({ error: "Headline must be 300 characters or fewer" });
    }

    const entries = readEntries(req.userId);
    const existing = entries.find((e) => e.date === date);
    if (existing) {
      return res
        .status(409)
        .json({ error: "An entry for this date already exists" });
    }

    let photo = null;
    if (req.files && req.files.photo && req.files.photo[0]) {
      photo = await processPhoto(req.files.photo[0].buffer, req.userId);
    }

    let video = null;
    if (req.files && req.files.video && req.files.video[0]) {
      const vf = req.files.video[0];
      video = saveVideo(vf.buffer, vf.originalname, req.userId);
    }

    const entry = {
      id: uuidv4(),
      date,
      headline,
      photo,
      video,
      createdAt: new Date().toISOString(),
    };

    entries.push(entry);
    writeEntries(req.userId, entries);

    res.status(201).json(entry);
  }
);

// Delete an entry
app.delete("/api/entries/:id", authenticate, (req, res) => {
  const entries = readEntries(req.userId);
  const index = entries.findIndex((e) => e.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Entry not found" });
  }

  const [removed] = entries.splice(index, 1);

  if (removed.photo) {
    const photoPath = path.join(UPLOADS_DIR, removed.photo);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }
  }

  if (removed.video) {
    const videoPath = path.join(UPLOADS_DIR, removed.video);
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  }

  writeEntries(req.userId, entries);
  res.json({ success: true });
});

// Update an entry
app.put(
  "/api/entries/:id",
  authenticate,
  (req, res, next) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      mediaUpload.fields([
        { name: "photo", maxCount: 1 },
        { name: "video", maxCount: 1 },
      ])(req, res, next);
    } else {
      next();
    }
  },
  async (req, res) => {
    const entries = readEntries(req.userId);
    const entry = entries.find((e) => e.id === req.params.id);

    if (!entry) {
      return res.status(404).json({ error: "Entry not found" });
    }

    if (req.body.headline !== undefined) {
      if (req.body.headline.length > 300) {
        return res
          .status(400)
          .json({ error: "Headline must be 300 characters or fewer" });
      }
      entry.headline = req.body.headline;
    }

    if (req.files && req.files.photo && req.files.photo[0]) {
      if (entry.photo) {
        const oldPhotoPath = path.join(UPLOADS_DIR, entry.photo);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
      entry.photo = await processPhoto(req.files.photo[0].buffer, req.userId);
    }

    if (req.files && req.files.video && req.files.video[0]) {
      if (entry.video) {
        const oldVideoPath = path.join(UPLOADS_DIR, entry.video);
        if (fs.existsSync(oldVideoPath)) {
          fs.unlinkSync(oldVideoPath);
        }
      }
      const vf = req.files.video[0];
      entry.video = saveVideo(vf.buffer, vf.originalname, req.userId);
    }

    // Allow removing video via explicit flag
    if (req.body.removeVideo === "true") {
      if (entry.video) {
        const oldVideoPath = path.join(UPLOADS_DIR, entry.video);
        if (fs.existsSync(oldVideoPath)) {
          fs.unlinkSync(oldVideoPath);
        }
        entry.video = null;
      }
    }

    writeEntries(req.userId, entries);
    res.json(entry);
  }
);

const PID_FILE = path.join(__dirname, '.server.pid');

function shutdown() {
  console.log(`thatday stopped (pid ${process.pid})`);
  try { fs.unlinkSync(PID_FILE); } catch (_) {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen(PORT, () => {
  fs.writeFileSync(PID_FILE, process.pid.toString());
  console.log(`thatday is running at http://localhost:${PORT} (pid ${process.pid})`);
});
