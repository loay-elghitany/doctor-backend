import mongoose from "mongoose";
import dotenv from "dotenv";
import Doctor from "./models/Doctor.js";

dotenv.config();

const migrateStatus = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const result = await Doctor.updateMany({ isActive: { $exists: false } }, [
      {
        $set: {
          isActive: {
            $cond: [{ $eq: ["$status", "active"] }, true, false],
          },
        },
      },
    ]);

    console.log(
      `Doctor status migration completed. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
    );
    process.exit();
  } catch (error) {
    console.error("Doctor status migration failed:", error);
    process.exit(1);
  }
};

migrateStatus();
