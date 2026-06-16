import mongoose from "mongoose";

const doctorPrivateFileSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ["image", "pdf", "audio", "other"],
      default: "other",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient querying by doctor and patient
doctorPrivateFileSchema.index({ patientId: 1, doctorId: 1 });

const DoctorPrivateFile = mongoose.model(
  "DoctorPrivateFile",
  doctorPrivateFileSchema,
);

export default DoctorPrivateFile;
