const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  secure: true,
});

module.exports = cloudinary;
