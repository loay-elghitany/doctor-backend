import { v4 as uuidv4 } from "uuid";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import path from "path";
import fs from "fs";
import MedicalFile from "../models/MedicalFile.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "medical-files");

const StorageAdapter = {
  getStorage: () => {
    return new CloudinaryStorage({
      cloudinary: cloudinary,
      params: (req, file) => {
        const folder = `medical-files/${req.user._id}`;
        const public_id = uuidv4();
        return {
          folder: folder,
          public_id: public_id,
          resource_type: "auto",
          type: "upload",
        };
      },
    });
  },

  deleteFile: async (storedName) => {
    try {
      const record = await MedicalFile.findOne({ storedName: storedName });
      if (record && record.cloudinaryPublicId) {
        await cloudinary.uploader.destroy(record.cloudinaryPublicId);
        return true;
      } else if (record) {
        // Fallback for old local files
        const p = path.join(UPLOADS_DIR, storedName);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          return true;
        }
      }
    } catch (err) {
      // swallow - caller should log
    }
    return false;
  },

  getDownloadUrl: (record) => {
    if (record.fileUrl && record.fileUrl.startsWith("http")) {
      return record.fileUrl;
    } else {
      return `/api/medical-files/download/${record.storedName}`;
    }
  },

  getFullPathForStoredName: (name) => {
    return path.join(UPLOADS_DIR, name);
  },
};

export default StorageAdapter;
