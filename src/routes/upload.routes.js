// src/routes/upload.routes.js
// Routes for file uploads

import { Router } from "express";
import { uploadImage, uploadMultipleImages, getPresignedUrl } from "../controllers/upload.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// Upload a single base64 image
router.post("/image", uploadImage);

// Upload multiple base64 images
router.post("/images", uploadMultipleImages);

// Get presigned URL for direct upload
router.post("/presigned", getPresignedUrl);

export default router;

