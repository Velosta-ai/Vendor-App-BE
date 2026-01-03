// src/services/s3.service.js
// AWS S3 Service for document uploads

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "velosta-customer-documents";

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file data as a buffer
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} folder - Folder path in S3 (e.g., "customer-ids", "bike-photos")
 * @returns {Promise<{url: string, key: string}>}
 */
export const uploadToS3 = async (fileBuffer, fileName, mimeType, folder = "documents") => {
  // Generate unique key
  const fileExtension = fileName.split(".").pop() || "jpg";
  const key = `${folder}/${uuidv4()}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    // Make the file publicly readable
    ACL: "public-read",
  });

  await s3Client.send(command);

  // Return the public URL
  const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${key}`;

  return { url, key };
};

/**
 * Upload a base64 encoded image to S3
 * @param {string} base64Data - Base64 encoded image data (with or without data URI prefix)
 * @param {string} folder - Folder path in S3
 * @returns {Promise<{url: string, key: string}>}
 */
export const uploadBase64ToS3 = async (base64Data, folder = "documents") => {
  // Remove data URI prefix if present
  let base64String = base64Data;
  let mimeType = "image/jpeg";

  if (base64Data.includes(",")) {
    const parts = base64Data.split(",");
    const header = parts[0];
    base64String = parts[1];

    // Extract mime type from header (e.g., "data:image/png;base64")
    const mimeMatch = header.match(/data:([^;]+);/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }
  }

  // Convert base64 to buffer
  const buffer = Buffer.from(base64String, "base64");

  // Determine file extension from mime type
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  };
  const extension = extensionMap[mimeType] || "jpg";

  // Generate unique key
  const key = `${folder}/${uuidv4()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  // Return the public URL
  const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${key}`;

  return { url, key };
};

/**
 * Delete a file from S3
 * @param {string} key - The S3 object key
 */
export const deleteFromS3 = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Generate a presigned URL for direct upload
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} folder - Folder path in S3
 * @returns {Promise<{uploadUrl: string, key: string, publicUrl: string}>}
 */
export const getPresignedUploadUrl = async (fileName, mimeType, folder = "documents") => {
  const fileExtension = fileName.split(".").pop() || "jpg";
  const key = `${folder}/${uuidv4()}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

  const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${key}`;

  return { uploadUrl, key, publicUrl };
};

export default {
  uploadToS3,
  uploadBase64ToS3,
  deleteFromS3,
  getPresignedUploadUrl,
};

