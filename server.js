require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");

const app = express();

// 🔐 Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ CORS Setup
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://risk-repost-frontend.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

// ✅ Multer Setup for File Upload
const upload = multer({ dest: "uploads/" });

// ✅ POST /upload — Upload Multiple Images to Cloudinary
app.post("/upload", upload.array("image", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path);
      uploadedUrls.push(result.secure_url);
      fs.unlinkSync(file.path); // delete local temp file
    }

    res.status(200).json({ images: uploadedUrls });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ✅ GET /images — Fetch All Images from Cloudinary
app.get("/images", async (req, res) => {
  try {
    let allImages = [];
    let nextCursor = undefined;

    do {
      const result = await cloudinary.search
        .expression("resource_type:image")
        .sort_by("created_at", "desc")
        .max_results(100)
        .next_cursor(nextCursor)
        .execute();

      const urls = result.resources.map((img) => img.secure_url);
      allImages.push(...urls);

      nextCursor = result.next_cursor;
    } while (nextCursor);

    res.status(200).json({ images: allImages });
  } catch (err) {
    console.error("Cloudinary fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// ✅ Root Route
app.get("/", (req, res) => {
  res.send("📦 Risk Repost backend is running.");
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
