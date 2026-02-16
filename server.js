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

// --- Middleware ---

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    maxAge: "365d",
    immutable: true,
  })
);

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
  upload.single("photo"),
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
    if (req.file) {
      photo = await processPhoto(req.file.buffer, req.userId);
    }

    const entry = {
      id: uuidv4(),
      date,
      headline,
      photo,
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
      upload.single("photo")(req, res, next);
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

    if (req.file) {
      if (entry.photo) {
        const oldPhotoPath = path.join(UPLOADS_DIR, entry.photo);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
      entry.photo = await processPhoto(req.file.buffer, req.userId);
    }

    writeEntries(req.userId, entries);
    res.json(entry);
  }
);

app.listen(PORT, () => {
  console.log(`thatday is running at http://localhost:${PORT}`);
});
