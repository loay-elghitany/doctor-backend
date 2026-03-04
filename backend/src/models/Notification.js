import mongoose from "mongoose";

/**
 * Notification Schema
 * Stores all WhatsApp notifications sent to patients and doctors
 * Used for logging, tracking delivery, and audit trails
 */
const notificationSchema = new mongoose.Schema(
  {
    // Core identifier and recipient info
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipientType", // Polymorphic reference: Patient or Doctor
      index: true,
    },
    recipientType: {
      type: String,
      enum: ["Patient", "Doctor"],
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      match:
        /^[+]?[(]?[0-9]{1,3}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,
    },

    // Notification type and content
    type: {
      type: String,
      enum: [
        "appointment_created",
        "appointment_confirmed",
        "appointment_rejected",
        "appointment_proposed",
        "appointment_cancelled",
        "prescription_created",
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },

    // Delivery status and tracking
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "bounced"],
      default: "pending",
      index: true,
    },
    sentAt: {
      type: Date,
      index: true,
    },
    failureReason: {
      type: String,
      maxlength: 500,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },

    // Event metadata for tracking relationships
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      index: true,
    },
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      index: true,
    },

    // Additional metadata
    actionUrl: {
      type: String,
      maxlength: 500,
    },
    whatsappMessageId: {
      type: String,
      unique: true,
      sparse: true, // Allow null values, but enforce uniqueness when present
    },
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
    deletedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes for common queries
notificationSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ appointmentId: 1, status: 1 });
notificationSchema.index({ prescriptionId: 1, status: 1 });
notificationSchema.index({ status: 1, sentAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 }); // For retry queries

export default mongoose.model("Notification", notificationSchema);
