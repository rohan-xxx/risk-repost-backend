require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");

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

// ✅ Multer setup for image upload
const upload = multer({ dest: "uploads/" });

// ✅ POST /upload — uploads multiple images to Cloudinary
app.post("/upload", upload.array("image", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path);
      uploadedUrls.push(result.secure_url);
      fs.unlinkSync(file.path); // clean local file
    }

    res.status(200).json({ urls: uploadedUrls });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ✅ GET /images?page=1 — fetch 20 images per page from Cloudinary
app.get("/images", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const result = await cloudinary.search
      .expression("resource_type:image")
      .sort_by("created_at", "desc")
      .max_results(500) // Max 500 per Cloudinary's search API
      .execute();

    const allImages = result.resources.map((img) => img.secure_url);
    const paginatedImages = allImages.slice(offset, offset + limit);
    const totalPages = Math.ceil(allImages.length / limit);

    res.status(200).json({
      images: paginatedImages,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error("Image fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.send("📦 Risk Repost backend running.");
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
