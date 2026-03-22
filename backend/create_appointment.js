import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "./src/models/Appointment.js";

dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");
  const apt = await Appointment.create({
    patientId: "69a18156fdd8dc654fd1c197",
    doctorId: "69a18156fdd8dc654fd1c194",
    date: new Date(),
    timeSlot: "10:00",
    status: "scheduled",
  });
  console.log("created appointment", apt);
  process.exit();
})();
