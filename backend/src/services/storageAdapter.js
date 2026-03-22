import storageUtils from "../utils/medicalFileStorage.js";

// Simple adapter interface for storage operations. Default implementation uses local disk.
const StorageAdapter = {
  getDiskStorage: (multer) => storageUtils.getDiskStorage(multer),
  getFullPathForStoredName: (name) =>
    storageUtils.getFullPathForStoredName(name),
  deleteFile: (name) => storageUtils.deleteFile(name),
  // In future add uploadToS3, getPublicUrl, etc.
};

export default StorageAdapter;
