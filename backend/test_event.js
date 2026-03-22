import mongoose from "mongoose";
import dotenv from "dotenv";
import PatientTimelineEvent from "./src/models/PatientTimelineEvent.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");
  try {
    const doc = await PatientTimelineEvent.create({
      patientId: "69a18156fdd8dc654fd1c197",
      doctorId: "69a18156fdd8dc654fd1c194",
      appointmentId: null,
      eventType: "medical_file_uploaded",
      eventTitle: "test",
      eventDescription: "desc",
      eventStatus: "completed",
      visibility: "doctor_only",
      metadata: { dummy: true },
    });
    console.log("created", doc);
  } catch (err) {
    console.error("error creating event", err);
  } finally {
    process.exit();
  }
}

run();
