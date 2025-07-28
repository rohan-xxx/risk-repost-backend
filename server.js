require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");
const { Client } = require("pg");

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
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

// ✅ CockroachDB Client
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    console.log("✅ CockroachDB connected");
  } catch (err) {
    console.error("❌ DB connection failed:", err);
  }
})();

// ✅ Ensure tables exist
(async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      public_id STRING NOT NULL,
      url STRING NOT NULL,
      likes INT8 DEFAULT 0,
      comments JSONB DEFAULT '[]'
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS image_likes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      image_id UUID NOT NULL,
      user_ip STRING NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT image_likes_image_id_fkey FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
      UNIQUE (image_id, user_ip)
    );
  `);
})();

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

      await client.query(
        "INSERT INTO images (public_id, url, likes, comments) VALUES ($1, $2, 0, '[]')",
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

// ✅ Fetch images with pagination
app.get("/images", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const result = await client.query(
      "SELECT id, url, likes, comments FROM images ORDER BY id DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    const totalCount = await client.query("SELECT COUNT(*) FROM images");
    const totalPages = Math.ceil(totalCount.rows[0].count / limit);

    res.status(200).json({
      images: result.rows,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error("Image fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// ✅ Like an image (IP-based restriction)
app.post("/like/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get user's IP address
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    // Check if IP already liked
    const existingLike = await client.query(
      "SELECT 1 FROM image_likes WHERE image_id = $1 AND user_ip = $2",
      [id, ip]
    );

    if (existingLike.rowCount > 0) {
      return res.status(400).json({ error: "You have already liked this image" });
    }

    // Insert into image_likes
    await client.query(
      "INSERT INTO image_likes (image_id, user_ip) VALUES ($1, $2)",
      [id, ip]
    );

    // Increment like count
    await client.query("UPDATE images SET likes = likes + 1 WHERE id = $1", [id]);

    res.json({ success: true, message: "Image liked successfully" });
  } catch (err) {
    console.error("Like error:", err.message);
    res.status(500).json({ error: "Failed to like image" });
  }
});

// ✅ Add comment (no user field, just text)
app.post("/comment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const data = await client.query("SELECT comments FROM images WHERE id = $1", [id]);
    let comments = data.rows[0].comments || [];
    if (typeof comments === "string") comments = JSON.parse(comments);

    comments.push({ comment: text });

    await client.query("UPDATE images SET comments = $1 WHERE id = $2", [
      JSON.stringify(comments),
      id
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.send("📦 Risk Repost backend running.");
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
