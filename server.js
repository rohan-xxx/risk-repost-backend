require("dotenv").config(); // Load .env file

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const fs = require("fs");
const path = require("path");

const app = express();

// ✅ CORS setup - include localhost and deployed frontend
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://risk-repost-frontend.onrender.com"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

// ✅ Cloudinary config from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer setup to store uploaded files temporarily
const upload = multer({ dest: "uploads/" });

// In-memory array to store uploaded image URLs
let uploadedImages = [];

// ✅ POST /upload — Upload an image and save Cloudinary URL
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const result = await cloudinary.uploader.upload(req.file.path);

    uploadedImages.push(result.secure_url);

    fs.unlinkSync(req.file.path); // Remove local file

    res.status(200).json({ url: result.secure_url });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ✅ GET /images — Return all uploaded image URLs
app.get("/images", (req, res) => {
  res.status(200).json(uploadedImages);
});

// ✅ Home route (optional, for testing)
app.get("/", (req, res) => {
  res.send("Image upload backend is running.");
});

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
