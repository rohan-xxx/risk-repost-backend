const express = require('express');
const multer = require('multer');
const cloudinary = require('../utils/cloudinary');
const router = express.Router();

// Multer setup (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const file = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(file, {
      folder: 'your-folder-name', // Optional
    });

    res.json({ url: result.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
