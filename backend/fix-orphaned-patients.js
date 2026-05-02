// Node.js script to fix orphaned patients
import mongoose from "mongoose";
import Patient from "./src/models/Patient.js";
import Doctor from "./src/models/Doctor.js";

async function fixOrphanedPatients() {
  try {
    // Connect to MongoDB (adjust connection string as needed)
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/mydoc",
    );

    console.log("Connected to MongoDB");

    // Find patients with clinicSlug but missing doctorId
    const orphanedPatients = await Patient.find({
      clinicSlug: { $exists: true, $ne: null },
      $or: [{ doctorId: { $exists: false } }, { doctorId: null }],
    });

    console.log(`Found ${orphanedPatients.length} orphaned patients`);

    let fixedCount = 0;

    for (const patient of orphanedPatients) {
      // Find the doctor by clinicSlug
      const doctor = await Doctor.findOne({ clinicSlug: patient.clinicSlug });

      if (doctor) {
        // Update the patient with the correct doctorId
        await Patient.updateOne(
          { _id: patient._id },
          { $set: { doctorId: doctor._id } },
        );

        console.log(
          `✅ Fixed patient: ${patient.name} (${patient.email}) -> Doctor: ${doctor.name}`,
        );
        fixedCount++;
      } else {
        console.log(
          `❌ No doctor found for clinicSlug: ${patient.clinicSlug} (Patient: ${patient.name})`,
        );
      }
    }

    console.log(
      `\n🎉 Patient fix completed! Fixed ${fixedCount} out of ${orphanedPatients.length} patients`,
    );
  } catch (error) {
    console.error("❌ Error fixing patients:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

fixOrphanedPatients();
