import mongoose from "mongoose";
import dotenv from "dotenv";
import Doctor from "./models/Doctor.js";
import Patient from "./models/Patient.js";
import logger from "./utils/logger.js";

dotenv.config();

// Connect to DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.debug("MongoDB connected"))
  .catch((err) => {
    logger.error("DB connection error:", err);
    process.exit(1);
  });

const seedTestData = async () => {
  try {
    // Clean up existing test data
    logger.debug("Cleaning up existing test data...");
    await Doctor.deleteMany({
      email: { $in: ["doctor@test.com", "ahmed@example.com"] },
    });
    await Patient.deleteMany({ email: "patient@test.com" });

    // Create test doctor
    logger.debug("Creating test doctor...");
    const doctor = await Doctor.create({
      name: "Dr. Ahmed Test",
      email: "doctor@test.com",
      password: "password123", // Will be hashed by pre-save hook
      clinicSlug: "dr-ahmed-test",
      plan: "pro",
      status: "active",
    });

    logger.debug("✓ Doctor created:", {
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      clinicSlug: doctor.clinicSlug,
      passwordHashed: !!doctor.password,
    });

    // Create test patient
    logger.debug("\nCreating test patient...");
    const patient = await Patient.create({
      name: "John Patient",
      email: "patient@test.com",
      password: "patientpass123",
      doctorId: doctor._id,
    });

    logger.debug("✓ Patient created:", {
      id: patient._id,
      name: patient.name,
      email: patient.email,
      doctorId: patient.doctorId,
    });

    logger.debug("\n========== TEST DATA CREATED SUCCESSFULLY ==========");
    logger.debug("\nTest Credentials:");
    logger.debug("─────────────────");
    logger.debug("DOCTOR LOGIN:");
    logger.debug("  Email: doctor@test.com");
    logger.debug("  Password: password123");
    logger.debug("  Role: doctor");
    logger.debug("\nPATIENT LOGIN:");
    logger.debug("  Email: patient@test.com");
    logger.debug("  Password: patientpass123");
    logger.debug("  Role: patient");
    logger.debug("─────────────────\n");

    process.exit(0);
  } catch (error) {
    logger.error("Error creating test data:", error);
    process.exit(1);
  }
};

seedTestData();
