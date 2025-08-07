require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");
const { Client } = require("pg");
const crypto = require("crypto");

const app = express();


const allowedOrigins = ["http://localhost:3000", "http://192.168.1.2:3000","https://risk-repost-backend.onrender.com","https://risk-repost-frontend.onrender.com" ];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

/* ✅ Cloudinary Config */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ✅ CockroachDB Client */
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await client.connect();
    console.log("✅ CockroachDB connected");
  } catch (err) {
    console.error("❌ DB connection failed:", err);
  }
})();

/* ✅ Ensure tables exist */
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

/* ✅ Multer setup */
const upload = multer({ dest: "uploads/" });

/* ✅ Upload images → Cloudinary + DB */
app.post("/upload", upload.array("image", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedImages = [];

    for (const file of req.files) {
      // ✅ Step 1: Read file buffer
      const fileBuffer = fs.readFileSync(file.path);

      // ✅ Step 2: Generate SHA-256 hash
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // ✅ Step 3: Check DB for duplicate hash
      const duplicate = await client.query("SELECT 1 FROM images WHERE etag = $1", [hash]);

      if (duplicate.rowCount > 0) {
        console.log("❌ Duplicate found:", file.originalname);
        fs.unlinkSync(file.path); // clean up
        continue;
      }

      // ✅ Step 4: Upload to Cloudinary
      const result = await cloudinary.uploader.upload(file.path);
      const { public_id, secure_url: url } = result;

      // ✅ Step 5: Insert image with computed hash
      const inserted = await client.query(
        "INSERT INTO images (public_id, url, likes, comments, etag) VALUES ($1, $2, 0, '[]', $3) RETURNING id, url, likes, comments",
        [public_id, url, hash]
      );

      uploadedImages.push(inserted.rows[0]);
      fs.unlinkSync(file.path); // clean up
    }

    if (uploadedImages.length === 0) {
      return res.status(409).json({ error: "All images were duplicates" });
    }

    res.status(200).json({ images: uploadedImages });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});




/* ✅ Fetch images with pagination */

//   const page = parseInt(req.query.page) || 1;
//   const limit = 20;
//   const offset = (page - 1) * limit;

//   try {
//     const result = await client.query(
//       "SELECT id, url, likes, comments FROM images ORDER BY created_at DESC LIMIT $1 OFFSET $2",
//       [limit, offset]
//     );

//     res.status(200).json({ images: result.rows });
//   } catch (err) {
//     console.error("Error fetching images:", err.message);
//     res.status(500).json({ error: "Failed to fetch images", details: err.message });
//   }
// });

app.get("/images", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    // 1. Get paginated images
    const result = await client.query(
      "SELECT id, url, likes, comments FROM images ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    // 2. Get total count of images
    const countResult = await client.query("SELECT COUNT(*) FROM images");
    const totalImages = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalImages / limit);

    // 3. Send all required data
    res.status(200).json({
      images: result.rows,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});




/* ✅ Like an image */
app.post("/like/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const existingLike = await client.query(
      "SELECT 1 FROM image_likes WHERE image_id = $1 AND user_ip = $2",
      [id, ip]
    );

    if (existingLike.rowCount > 0) {
      return res.status(400).json({ error: "You have already liked this image" });
    }

    await client.query(
      "INSERT INTO image_likes (image_id, user_ip) VALUES ($1, $2)",
      [id, ip]
    );

    await client.query("UPDATE images SET likes = likes + 1 WHERE id = $1", [id]);

    res.json({ success: true, message: "Image liked successfully" });
  } catch (err) {
    console.error("Like error:", err.message);
    res.status(500).json({ error: "Failed to like image" });
  }
});

/* ✅ Add comment */
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
      id,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

/* ✅ Root endpoint */
app.get("/", (req, res) => {
  res.send("📦 Risk Repost backend running.");
});

/* ✅ Start server */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
