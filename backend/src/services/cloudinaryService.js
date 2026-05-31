import { v2 as cloudinary } from "cloudinary";
import logger from "../utils/logger.js";

/**
 * Cloudinary Service
 * Handles file uploads to Cloudinary
 */

class CloudinaryService {
  constructor() {
    this.isConfigured = false;
  }

  ensureConfigured() {
    if (!this.isConfigured && process.env.CLOUDINARY_CLOUD_NAME) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      this.isConfigured = true;
      logger.info("CloudinaryService", "Cloudinary configured successfully");
    }
  }

  /**
   * Extract public_id from a Cloudinary URL
   * @param {string} cloudinaryUrl - The Cloudinary URL
   * @returns {string|null} - The public_id or null if unable to extract
   */
  extractPublicId(cloudinaryUrl) {
    if (!cloudinaryUrl) return null;
    try {
      // Cloudinary URLs format may include transformations and version segments.
      const urlParts = cloudinaryUrl.split("/upload/");
      if (urlParts.length < 2) return null;

      const pathParts = urlParts[1].split("/");
      // Remove version tokens like v1234567890 if present
      const filteredParts = pathParts.filter((part) => !/^v\d+$/.test(part));

      const fileName = filteredParts.pop();
      if (!fileName) return null;

      const publicId = fileName.replace(/\.[^/.]+$/, "");
      if (filteredParts.length > 0) {
        return `${filteredParts.join("/")}/${publicId}`;
      }
      return publicId;
    } catch (error) {
      logger.error(
        "CloudinaryService",
        "Failed to extract public_id from URL",
        {
          url: cloudinaryUrl,
          error: error.message,
        },
      );
      return null;
    }
  }

  /**
   * Delete a file from Cloudinary
   * @param {string} cloudinaryUrl - The Cloudinary URL of the file to delete
   * @returns {Promise<boolean>} - True if deletion was successful
   */
  async deleteFile(cloudinaryUrl) {
    this.ensureConfigured();

    if (!cloudinaryUrl) {
      logger.warn("CloudinaryService", "No URL provided for deletion");
      return false;
    }

    try {
      const publicId = this.extractPublicId(cloudinaryUrl);
      if (!publicId) {
        logger.warn(
          "CloudinaryService",
          "Could not extract public_id from URL",
          { url: cloudinaryUrl },
        );
        return false;
      }

      const result = await cloudinary.uploader.destroy(publicId);

      if (result.result === "ok") {
        logger.info("CloudinaryService", "File deleted successfully", {
          publicId,
          url: cloudinaryUrl,
        });
        return true;
      } else {
        logger.warn(
          "CloudinaryService",
          "File deletion returned non-ok result",
          { publicId, result: result.result },
        );
        return false;
      }
    } catch (error) {
      logger.error(
        "CloudinaryService",
        "Failed to delete file from Cloudinary",
        {
          url: cloudinaryUrl,
          error: error.message,
        },
      );
      throw new Error(
        `Failed to delete file from Cloudinary: ${error.message}`,
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
    this.ensureConfigured();

    try {
      const uploadOptions = {
        resource_type: "auto",
        folder: "scanned-prescriptions",
        use_filename: true,
        unique_filename: true,
      };

      if (fileType === "pdf") {
        uploadOptions.format = "pdf";
      }

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
