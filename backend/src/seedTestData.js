import mongoose from "mongoose";
import dotenv from "dotenv";
import Doctor from "./models/Doctor.js";
import Patient from "./models/Patient.js";

dotenv.config();

// Connect to DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("DB connection error:", err);
    process.exit(1);
  });

const seedTestData = async () => {
  try {
    // Clean up existing test data
    console.log("Cleaning up existing test data...");
    await Doctor.deleteMany({
      email: { $in: ["doctor@test.com", "ahmed@example.com"] },
    });
    await Patient.deleteMany({ email: "patient@test.com" });

    // Create test doctor
    console.log("Creating test doctor...");
    const doctor = await Doctor.create({
      name: "Dr. Ahmed Test",
      email: "doctor@test.com",
      password: "password123", // Will be hashed by pre-save hook
      clinicSlug: "dr-ahmed-test",
      plan: "pro",
      status: "active",
    });

    console.log("✓ Doctor created:", {
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      clinicSlug: doctor.clinicSlug,
      passwordHashed: !!doctor.password,
    });

    // Create test patient
    console.log("\nCreating test patient...");
    const patient = await Patient.create({
      name: "John Patient",
      email: "patient@test.com",
      password: "patientpass123",
      doctorId: doctor._id,
    });

    console.log("✓ Patient created:", {
      id: patient._id,
      name: patient.name,
      email: patient.email,
      doctorId: patient.doctorId,
    });

    console.log("\n========== TEST DATA CREATED SUCCESSFULLY ==========");
    console.log("\nTest Credentials:");
    console.log("─────────────────");
    console.log("DOCTOR LOGIN:");
    console.log("  Email: doctor@test.com");
    console.log("  Password: password123");
    console.log("  Role: doctor");
    console.log("\nPATIENT LOGIN:");
    console.log("  Email: patient@test.com");
    console.log("  Password: patientpass123");
    console.log("  Role: patient");
    console.log("─────────────────\n");

    process.exit(0);
  } catch (error) {
    console.error("Error creating test data:", error);
    process.exit(1);
  }
};

seedTestData();
