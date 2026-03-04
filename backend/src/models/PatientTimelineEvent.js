import mongoose from "mongoose";

const patientTimelineEventSchema = new mongoose.Schema(
  {
    // Core identifiers
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

    // Optional appointment link
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
      index: true,
    },

    // Event classification
    eventType: {
      type: String,
      enum: [
        "appointment_created",
        "appointment_approved",
        "appointment_rejected",
        "appointment_completed",
        "prescription_created",
        "doctor_note_added",
        "medical_file_uploaded",
      ],
      required: true,
      index: true,
    },

    // Display information
    eventTitle: {
      type: String,
      required: true,
    },

    eventDescription: {
      type: String,
      default: "",
    },

    eventStatus: {
      type: String,
      default: "completed",
    },

    // Visibility control
    visibility: {
      type: String,
      enum: ["doctor_only", "patient_visible"],
      default: "patient_visible",
      index: true,
    },

    // Flexible metadata storage
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Soft delete support
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

// Compound index for efficient patient timeline queries
patientTimelineEventSchema.index(
  { patientId: 1, doctorId: 1, createdAt: -1 },
  { name: "patient_doctor_timeline_index" },
);

// Index for visibility filtering
patientTimelineEventSchema.index(
  { patientId: 1, visibility: 1, createdAt: -1 },
  { name: "patient_visibility_timeline_index" },
);

// Index for event type lookups
patientTimelineEventSchema.index(
  { patientId: 1, eventType: 1, createdAt: -1 },
  { name: "patient_eventtype_timeline_index" },
);

const PatientTimelineEvent = mongoose.model(
  "PatientTimelineEvent",
  patientTimelineEventSchema,
);

export default PatientTimelineEvent;
