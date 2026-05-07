import mongoose from "mongoose";

/**
 * Scanned Prescription Schema
 * Stores uploaded scanned prescription files
 */
const scannedPrescriptionSchema = new mongoose.Schema(
  {
    // Patient who owns the prescription
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    // Doctor associated with the prescription (optional)
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      index: true,
    },

    // Secretary who uploaded the prescription
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Secretary",
      required: true,
      index: true,
    },

    // Cloudinary file URL
    fileUrl: {
      type: String,
      required: true,
    },

    // File type (image, pdf)
    fileType: {
      type: String,
      enum: ["image", "pdf"],
      required: true,
    },

    // Optional notes
    notes: {
      type: String,
      maxlength: 500,
    },

    // Clinic slug for multi-tenant isolation
    clinicSlug: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
scannedPrescriptionSchema.index({ patientId: 1, createdAt: -1 });
scannedPrescriptionSchema.index({ clinicSlug: 1, createdAt: -1 });

export default mongoose.model("ScannedPrescription", scannedPrescriptionSchema);
