require("dotenv").config(); // Load .env file

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const fs = require("fs");

const app = express();

// ✅ CORS setup - allow multiple environments
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001", // ✅ support for local frontend
      "https://risk-repost-frontend.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

// ✅ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer setup
const upload = multer({ dest: "uploads/" });

// ✅ In-memory array to store uploaded image URLs
let uploadedImages = [];

// ✅ POST /upload — handle multiple image uploads (10 max)
app.post("/upload", upload.array("image", 10), async (req, res) => {
  try {
    console.log("▶️ Upload route hit");
    console.log("Files received:", req.files?.length);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      console.log("⏫ Uploading file to Cloudinary:", file.originalname);
      const result = await cloudinary.uploader.upload(file.path);

      // ✅ Prevent duplicate: check if URL already exists
      if (!uploadedImages.includes(result.secure_url)) {
        uploadedImages.push(result.secure_url);
        uploadedUrls.push(result.secure_url);
      } else {
        console.log("⚠️ Duplicate image skipped:", result.secure_url);
      }

      fs.unlinkSync(file.path); // clean up local temp file
    }

    console.log("✅ New uploads:", uploadedUrls);
    res.status(200).json({ url: uploadedUrls });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ✅ GET /images — return all uploaded URLs
app.get("/images", (req, res) => {
  res.status(200).json({ images: uploadedImages });
});

// ✅ Health check
app.get("/", (req, res) => {
  res.send("📦 Risk Repost backend running.");
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
