import mongoose from "mongoose";
import dotenv from "dotenv";
import MedicalFile from "./src/models/MedicalFile.js";
import PatientTimelineEvent from "./src/models/PatientTimelineEvent.js";

dotenv.config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    verify();
  })
  .catch((err) => console.error("Could not connect to MongoDB...", err));

async function verify() {
  // use file saved during HTTP upload test
  const storedName = "ab981d97-f4e0-438a-aeaa-a80cf63ff20e.pdf";
  const file = await MedicalFile.findOne({ storedName: storedName });
  if (file) {
    console.log("File found in database:");
    console.log(file);

    const timelineEvent = await PatientTimelineEvent.findOne({
      "metadata.fileId": file._id,
    });
    if (timelineEvent) {
      console.log("Timeline event found in database:");
      console.log(timelineEvent);
    } else {
      console.log("Timeline event not found in database.");
    }
  } else {
    console.log("File not found in database.");
  }
  mongoose.connection.close();
}
