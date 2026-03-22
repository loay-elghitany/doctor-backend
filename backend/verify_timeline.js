import mongoose from "mongoose";
import dotenv from "dotenv";
import PatientTimelineEvent from "./src/models/PatientTimelineEvent.js";

dotenv.config();

const verifyTimeline = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const patientId = "69a18156fdd8dc654fd1c197";
    const event = await PatientTimelineEvent.findOne({
      patientId: patientId,
      eventType: "medical_file_uploaded",
    });

    if (event) {
      console.log("Timeline event found:", event);
    } else {
      console.log("No timeline event found for the file upload.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error verifying timeline:", error);
    process.exit(1);
  }
};

verifyTimeline();
