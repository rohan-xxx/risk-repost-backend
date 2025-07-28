require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");
const { Pool } = require("pg");

const app = express();

// ✅ CORS setup
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://risk-repost-frontend.onrender.com"
    ],
    methods: ["GET", "POST"],
    credentials: true
  })
);
app.use(express.json());

// ✅ Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ✅ CockroachDB Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ Test DB Connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) console.error("❌ DB connection failed:", err);
  else console.log("✅ CockroachDB connected:", res.rows[0]);
});

// ✅ Multer setup
const upload = multer({ dest: "uploads/" });

// ✅ Upload images → Cloudinary + DB
app.post("/upload", upload.array("image", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedImages = [];

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path);

      // Save to DB
      await pool.query(
        "INSERT INTO images (public_id, url) VALUES ($1, $2)",
        [result.public_id, result.secure_url]
      );

      uploadedImages.push(result.secure_url);
      fs.unlinkSync(file.path);
    }

    res.status(200).json({ urls: uploadedImages });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ✅ Fetch images (with likes/comments)
app.get("/images", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      "SELECT id, url, likes, comments FROM images ORDER BY id DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    const totalCount = await pool.query("SELECT COUNT(*) FROM images");
    const totalPages = Math.ceil(totalCount.rows[0].count / limit);

    res.status(200).json({
      images: rows,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error("Image fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// ✅ Like an image
app.post("/like/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE images SET likes = likes + 1 WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to like image" });
  }
});

// ✅ Add comment to image
app.post("/comment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user, text } = req.body;

    const { rows } = await pool.query("SELECT comments FROM images WHERE id = $1", [id]);
    let comments = rows[0].comments || [];
    comments.push({ user, text });

    await pool.query("UPDATE images SET comments = $1 WHERE id = $2", [
      JSON.stringify(comments),
      id
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// ✅ Root
app.get("/", (req, res) => {
  res.send("📦 Risk Repost backend running.");
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
