const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "data", "entries.json");
const UPLOADS_DIR = path.join(__dirname, "data", "uploads");

// Ensure directories exist
fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initialize data file if missing
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// Multer config — store in memory so sharp can process before saving
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // accept up to 20 MB, we'll compress down
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
 * Saves as JPEG and returns the filename.
 */
async function processPhoto(buffer) {
  const filename = `${uuidv4()}.jpg`;
  const outputPath = path.join(UPLOADS_DIR, filename);

  // Try quality levels from high to low
  const qualities = [65, 50, 40, 30, 20];
  // Max widths to try if quality alone isn't enough
  const maxWidths = [1800, 1400, 1000, 800, 600];

  // First attempt: just convert to JPEG at high quality
  for (const quality of qualities) {
    const result = await sharp(buffer)
      .rotate() // auto-rotate based on EXIF
      .jpeg({ quality })
      .toBuffer();

    if (result.length <= MAX_BYTES) {
      fs.writeFileSync(outputPath, result);
      return filename;
    }
  }

  // If still too large, also resize down
  for (const width of maxWidths) {
    for (const quality of qualities) {
      const result = await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();

      if (result.length <= MAX_BYTES) {
        fs.writeFileSync(outputPath, result);
        return filename;
      }
    }
  }

  // Last resort: aggressive resize
  const result = await sharp(buffer)
    .rotate()
    .resize({ width: 400, withoutEnlargement: true })
    .jpeg({ quality: 20 })
    .toBuffer();

  fs.writeFileSync(outputPath, result);
  return filename;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR, {
  maxAge: "365d",
  immutable: true,
}));

// --- Helpers ---

function readEntries() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

// --- API Routes ---

// Get all entries (sorted newest first)
app.get("/api/entries", (_req, res) => {
  const entries = readEntries();
  entries.sort((a, b) => b.date.localeCompare(a.date));
  res.json(entries);
});

// Create a new entry
app.post("/api/entries", upload.single("photo"), async (req, res) => {
  const { headline, date } = req.body;

  if (!headline || !date) {
    return res.status(400).json({ error: "Headline and date are required" });
  }

  if (headline.length > 300) {
    return res
      .status(400)
      .json({ error: "Headline must be 300 characters or fewer" });
  }

  // Check if an entry for this date already exists
  const entries = readEntries();
  const existing = entries.find((e) => e.date === date);
  if (existing) {
    return res
      .status(409)
      .json({ error: "An entry for this date already exists" });
  }

  let photo = null;
  if (req.file) {
    photo = await processPhoto(req.file.buffer);
  }

  const entry = {
    id: uuidv4(),
    date,
    headline,
    photo,
    createdAt: new Date().toISOString(),
  };

  entries.push(entry);
  writeEntries(entries);

  res.status(201).json(entry);
});

// Delete an entry
app.delete("/api/entries/:id", (req, res) => {
  const entries = readEntries();
  const index = entries.findIndex((e) => e.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Entry not found" });
  }

  const [removed] = entries.splice(index, 1);

  // Delete photo file
  const photoPath = path.join(UPLOADS_DIR, removed.photo);
  if (removed.photo && fs.existsSync(photoPath)) {
    fs.unlinkSync(photoPath);
  }

  writeEntries(entries);
  res.json({ success: true });
});

// Update an entry (accepts JSON or multipart)
app.put("/api/entries/:id", (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    upload.single("photo")(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  const entries = readEntries();
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
    // Delete old photo
    if (entry.photo) {
      const oldPhotoPath = path.join(UPLOADS_DIR, entry.photo);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }
    entry.photo = await processPhoto(req.file.buffer);
  }

  writeEntries(entries);
  res.json(entry);
});

app.listen(PORT, () => {
  console.log(`thatday is running at http://localhost:${PORT}`);
});
