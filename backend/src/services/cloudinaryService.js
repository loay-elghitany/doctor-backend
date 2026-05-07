import { v2 as cloudinary } from "cloudinary";
import logger from "../utils/logger.js";

/**
 * Cloudinary Service
 * Handles file uploads to Cloudinary
 */

class CloudinaryService {
  constructor() {
    this.isConfigured = false;

    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });

      this.isConfigured = true;
      logger.info("CloudinaryService", "Cloudinary configured successfully");
    } else {
      logger.warn(
        "CloudinaryService",
        "Cloudinary not configured - missing environment variables",
      );
    }
  }

  /**
   * Upload a file buffer to Cloudinary
   * @param {Buffer} buffer - File buffer
   * @param {string} fileType - 'image' or 'pdf'
   * @param {string} publicId - Optional public ID for the file
   * @returns {Promise<string>} - Cloudinary URL
   */
  async uploadBuffer(buffer, fileType, publicId = null) {
    if (!this.isConfigured) {
      throw new Error("Cloudinary is not configured");
    }

    try {
      const resourceType = fileType === "pdf" ? "raw" : "image";

      const uploadOptions = {
        resource_type: resourceType,
        folder: "scanned-prescriptions",
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(uploadOptions, (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          })
          .end(buffer);
      });

      logger.info("CloudinaryService", "File uploaded successfully", {
        url: result.secure_url,
        publicId: result.public_id,
      });

      return result.secure_url;
    } catch (error) {
      logger.error("CloudinaryService", "Upload failed", error);
      throw new Error(`Failed to upload file to Cloudinary: ${error.message}`);
    }
  }
}

const cloudinaryService = new CloudinaryService();
export default cloudinaryService;
