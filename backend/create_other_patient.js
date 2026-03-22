import mongoose from "mongoose";
import dotenv from "dotenv";
import Patient from "./src/models/Patient.js";

dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected DB");
  const other = await Patient.create({
    name: "Jane Other",
    email: "other@test.com",
    password: "otherpass",
    doctorId: new mongoose.Types.ObjectId(), // some random doctor not our doctor
  });
  console.log("created other patient", other);
  process.exit();
})();
