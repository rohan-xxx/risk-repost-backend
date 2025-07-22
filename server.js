require("dotenv").config(); // Load .env file

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const fs = require("fs");
const app = express();

// ✅ CORS setup
app.use(
  cors({
    origin: ["http://localhost:3000", "http://192.168.1.2:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());

// ✅ Cloudinary config using .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer setup to store uploaded files temporarily
const upload = multer({ dest: "uploads/" });

let uploadedImages = [];

// ✅ Upload Endpoint (accepts 1 file with key = "image")
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path);
    uploadedImages.push(result.secure_url);
    fs.unlinkSync(req.file.path); // Delete local file
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error("Cloudinary Error:", err.message);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ✅ Endpoint to get all image URLs
app.get("/images", (req, res) => {
  res.json(uploadedImages);
});

// ✅ Start server
app.listen(5000, () => console.log("Server started on http://localhost:5000"));
