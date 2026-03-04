import mongoose from "mongoose";

const medicalFileSchema = new mongoose.Schema(
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
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: false,
      default: null,
    },
    fileType: {
      type: String,
      enum: ["image", "pdf"],
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    storedName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
      default: 0,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: false,
      default: null,
    },
    notes: {
      type: String,
      required: false,
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);
// Indexes to support efficient queries

medicalFileSchema.index({ createdAt: -1 });

const MedicalFile = mongoose.model("MedicalFile", medicalFileSchema);
export default MedicalFile;
