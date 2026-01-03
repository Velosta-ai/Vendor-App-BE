// src/controllers/upload.controller.js
// Controller for file uploads to S3

import { uploadBase64ToS3, getPresignedUploadUrl } from "../services/s3.service.js";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  ERROR_CODES,
} from "../utils/response.js";

/**
 * Upload a base64 encoded image
 * POST /api/upload/image
 * Body: { image: "base64...", folder: "customer-ids" }
 */
export const uploadImage = async (req, res) => {
  try {
    const { image, folder = "documents" } = req.body;

    if (!image) {
      return errorResponse(res, "Image data is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    // Validate folder to prevent path traversal
    const allowedFolders = ["customer-ids", "bike-photos", "documents"];
    const safeFolder = allowedFolders.includes(folder) ? folder : "documents";

    // Add organization ID to folder path for isolation
    const orgFolder = `${req.organizationId}/${safeFolder}`;

    const result = await uploadBase64ToS3(image, orgFolder);

    return successResponse(res, result, "Image uploaded successfully");
  } catch (err) {
    console.error("Error uploading image:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * Upload multiple base64 encoded images
 * POST /api/upload/images
 * Body: { images: ["base64...", "base64..."], folder: "bike-photos" }
 */
export const uploadMultipleImages = async (req, res) => {
  try {
    const { images, folder = "documents" } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return errorResponse(res, "Images array is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    if (images.length > 10) {
      return errorResponse(res, "Maximum 10 images allowed per request", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    // Validate folder
    const allowedFolders = ["customer-ids", "bike-photos", "documents"];
    const safeFolder = allowedFolders.includes(folder) ? folder : "documents";
    const orgFolder = `${req.organizationId}/${safeFolder}`;

    // Upload all images
    const results = await Promise.all(
      images.map((image) => uploadBase64ToS3(image, orgFolder))
    );

    return successResponse(res, { urls: results.map((r) => r.url) }, "Images uploaded successfully");
  } catch (err) {
    console.error("Error uploading images:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * Get a presigned URL for direct upload
 * POST /api/upload/presigned
 * Body: { fileName: "photo.jpg", mimeType: "image/jpeg", folder: "customer-ids" }
 */
export const getPresignedUrl = async (req, res) => {
  try {
    const { fileName, mimeType, folder = "documents" } = req.body;

    if (!fileName || !mimeType) {
      return errorResponse(res, "fileName and mimeType are required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    // Validate mime type
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowedMimeTypes.includes(mimeType)) {
      return errorResponse(res, "Invalid file type. Allowed: JPEG, PNG, WebP, PDF", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    // Validate folder
    const allowedFolders = ["customer-ids", "bike-photos", "documents"];
    const safeFolder = allowedFolders.includes(folder) ? folder : "documents";
    const orgFolder = `${req.organizationId}/${safeFolder}`;

    const result = await getPresignedUploadUrl(fileName, mimeType, orgFolder);

    return successResponse(res, result, "Presigned URL generated");
  } catch (err) {
    console.error("Error generating presigned URL:", err);
    return serverErrorResponse(res, err);
  }
};

