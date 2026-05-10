import mongoose from "mongoose";

const privateNoteSchema = new mongoose.Schema(
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
    content: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      enum: ["red", "green", "blue", "yellow"],
      default: "yellow",
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index to ensure uniqueness per doctor-patient pair if needed, but allow multiple notes
privateNoteSchema.index({ patientId: 1, doctorId: 1 });

const PrivateNote = mongoose.model("PrivateNote", privateNoteSchema);

export default PrivateNote;
