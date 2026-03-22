import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "medical-files");

// Ensure uploads directory exists
export const ensureUploadsDir = () => {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    // Ignore - will throw at write time if it fails
  }
};

// Returns multer diskStorage config
export const getDiskStorage = (multer) => {
  ensureUploadsDir();

  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = uuidv4() + ext;
      cb(null, name);
    },
  });
};

export const getFullPathForStoredName = (storedName) => {
  return path.join(UPLOADS_DIR, storedName);
};

export const deleteFile = (storedName) => {
  try {
    const p = getFullPathForStoredName(storedName);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (err) {
    // swallow - caller should log
  }
  return false;
};

export default {
  ensureUploadsDir,
  getDiskStorage,
  getFullPathForStoredName,
  deleteFile,
};
