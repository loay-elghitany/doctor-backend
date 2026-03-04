import mongoose from "mongoose";

const prescriptionSchema = new mongoose.Schema(
  {
    // Link to appointment - REQUIRED (prescriptions always linked to appointments)
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      index: true,
    },

    // Doctor who created the prescription
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },

    // Patient for multi-tenant isolation
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },

    // Array of medications
    medications: [
      {
        name: {
          type: String,
          required: true,
        },
        dosage: {
          type: String,
          default: null,
        },
        frequency: {
          type: String,
          default: null,
        },
        duration: {
          type: String,
          default: null,
        },
        instructions: {
          type: String,
          default: null,
        },
      },
    ],

    // Medical information
    diagnosis: {
      type: String,
      default: null,
    },

    notes: {
      type: String,
      default: null,
    },

    // Future attachment support
    attachments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient queries
prescriptionSchema.index(
  { appointmentId: 1, doctorId: 1 },
  { name: "appointment_doctor_index" },
);

// Index for patient queries
prescriptionSchema.index(
  { patientId: 1, createdAt: -1 },
  { name: "patient_date_index" },
);

const Prescription = mongoose.model("Prescription", prescriptionSchema);

export default Prescription;
