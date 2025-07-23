require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const fs = require("fs");

const app = express();

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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ dest: "uploads/" });

let uploadedImages = [];

// ✅ POST /upload — uploads multiple images
app.post("/upload", upload.array("image", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path);
      uploadedImages.unshift(result.secure_url); // Add to beginning
      uploadedUrls.push(result.secure_url);
      fs.unlinkSync(file.path); // Clean up local temp file
    }

    res.status(200).json({ url: uploadedUrls });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ✅ GET /images
app.get("/images", (req, res) => {
  res.status(200).json({ images: uploadedImages });
});

app.get("/", (req, res) => {
  res.send("📦 Risk Repost backend running.");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
