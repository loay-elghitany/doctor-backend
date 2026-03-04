import mongoose from "mongoose";
import dotenv from "dotenv";
import PatientTimelineEvent from "./src/models/PatientTimelineEvent.js";

dotenv.config();
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const dup = await PatientTimelineEvent.aggregate([
    { $group: { _id: "$metadata.fileId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 }, _id: { $ne: null } } },
  ]);
  console.log("duplicates", dup);
  process.exit();
})();
