import mongoose from "mongoose";
import dotenv from "dotenv";
import Doctor from "./models/Doctor.js";

dotenv.config();

// connect to DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

const seedDoctor = async () => {
  try {
    // Delete any existing doctor with the same email/clinicSlug
    await Doctor.deleteMany({ email: "ahmed@example.com" });

    // DO NOT pre-hash here - let the pre-save hook handle hashing
    // This prevents double-hashing which would break login
    const doctor = await Doctor.create({
      name: "Dr. Ahmed",
      email: "ahmed@example.com",
      password: "123456", // Pass plaintext - hook will hash it
      clinicSlug: "dr-ahmed",
      plan: "free",
      status: "active",
    });

    console.log("Doctor created:", {
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      clinicSlug: doctor.clinicSlug,
    });
    process.exit();
  } catch (error) {
    console.error("Error creating doctor:", error);
    process.exit(1);
  }
};

seedDoctor();
