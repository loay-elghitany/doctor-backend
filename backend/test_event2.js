import mongoose from "mongoose";
import dotenv from "dotenv";
import PatientTimelineEvent from "./src/models/PatientTimelineEvent.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected for test2");
  try {
    const doc = await PatientTimelineEvent.create({
      patientId: "69a18156fdd8dc654fd1c197",
      doctorId: "69a18156fdd8dc654fd1c194",
      appointmentId: null,
      eventType: "medical_file_uploaded",
      eventTitle: "sample.pdf",
      eventDescription: "Uploaded pdf file: sample.pdf",
      eventStatus: "completed",
      visibility: "doctor_only",
      metadata: {
        fileId: "69a18646fd11eb8285f4bd84",
        fileName: "sample.pdf",
        fileSize: 106,
        fileType: "pdf",
      },
    });
    console.log("created2", doc);
  } catch (err) {
    console.error("error creating event2", err);
  } finally {
    process.exit();
  }
}

run();
