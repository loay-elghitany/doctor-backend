import MedicalFile from "../models/MedicalFile.js";
import StorageAdapter from "../services/storageAdapter.js";
import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";


// Cleanup job: physically delete files that were soft-deleted more than X days ago.
// Disabled by default. To run: node src/jobs/cleanupMedicalFiles.js

const DAYS_BEFORE_PHYSICAL_DELETE = parseInt(
  process.env.MEDICAL_FILES_CLEANUP_DAYS || "30",
  10,
);

const runCleanup = async () => {
  try {
    const cutoff = new Date(
      Date.now() - DAYS_BEFORE_PHYSICAL_DELETE * 24 * 3600 * 1000,
    );
    const files = await MedicalFile.find({
      isDeleted: true,
      deletedAt: { $lte: cutoff },
    });
    for (const f of files) {
      try {
        if (f.storedName) {
          StorageAdapter.deleteFile(f.storedName);
        }
        await AuditLog.create({
          actorType: "System",
          action: "medicalfile:physical_deleted",
          resourceType: "MedicalFile",
          resourceId: f._id,
          meta: { storedName: f.storedName },
        });
        await f.remove();
      } catch (err) {
        logger.error("Failed to cleanup file", f._id, err.message || err);
      }
    }
    logger.debug(`Cleanup completed. Processed ${files.length} files.`);
    process.exit(0);
  } catch (err) {
    logger.error("Cleanup job failed", err);
    process.exit(1);
  }
};

if (require.main === module) {
  runCleanup();
}

export default runCleanup;
