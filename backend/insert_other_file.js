import mongoose from "mongoose";
import dotenv from "dotenv";
import MedicalFile from "./src/models/MedicalFile.js";

dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("connected");
  const file = await MedicalFile.create({
    patientId: "69a18d42067a8e50b7e44056",
    doctorId: "69a18d42067a8e50b7e44055",
    appointmentId: null,
    fileType: "pdf",
    fileName: "other.pdf",
    storedName: "other-test.pdf",
    fileSize: 10,
    fileUrl: "/api/medical-files/download/other-test.pdf",
    title: "Other file",
    notes: null,
    uploadedAt: new Date(),
  });
  console.log("created file record", file);
  process.exit();
})();
