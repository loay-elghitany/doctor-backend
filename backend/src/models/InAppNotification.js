import mongoose from "mongoose";

/**
 * In-App Notification Schema
 * Stores persistent notifications for the real-time notification system
 * Ensures notifications are never lost, even if users are offline
 */
const inAppNotificationSchema = new mongoose.Schema(
  {
    // Recipient information (who receives the notification)
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipientRole", // Polymorphic reference
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ["patient", "doctor", "secretary"],
      required: true,
      index: true,
    },
    recipientClinicSlug: {
      type: String,
      index: true,
      // Used for staff notifications (doctor/secretary in a clinic)
    },

    // Sender information (who triggered the action)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "senderRole",
      index: true,
    },
    senderRole: {
      type: String,
      enum: ["patient", "doctor", "secretary", "system"],
      default: "system",
    },
    senderName: {
      type: String,
      // Human-readable name of the sender
    },

    // Notification categorization
    type: {
      type: String,
      enum: [
        // Appointment related
        "NEW_APPOINTMENT",
        "APPOINTMENT_CONFIRMED",
        "APPOINTMENT_PROPOSED",
        "APPOINTMENT_ACCEPTED",
        "APPOINTMENT_REJECTED",
        "APPOINTMENT_RESCHEDULED",
        "APPOINTMENT_COMPLETED",
        "APPOINTMENT_CANCELLED",
        // Patient related
        "NEW_PATIENT_REGISTERED",
        "PATIENT_UPDATED",
        "NEW_MEDICAL_NOTE",
        // Prescription related
        "NEW_PRESCRIPTION",
        "PRESCRIPTION_UPDATED",
        "SCANNED_PRESCRIPTION_UPLOADED",
        // Financial related
        "NEW_FINANCIAL_PLAN",
        "NEW_PAYMENT_MADE",
        "PAYMENT_RECORDED",
        // System
        "SYSTEM_NOTIFICATION",
      ],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        "appointment",
        "patient",
        "prescription",
        "financial",
        "payment",
        "system",
      ],
      default: "system",
      index: true,
    },

    // Content (all in Arabic)
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },

    // Link to related resource
    link: {
      type: String,
      maxlength: 500,
      // URL to the specific appointment, patient, or record
    },
    linkType: {
      type: String,
      enum: ["appointment", "patient", "prescription", "dashboard", "external"],
    },

    // Related entity references
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      index: true,
    },
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      index: true,
    },

    // Read status
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },

    // Real-time delivery tracking
    deliveredViaSocket: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },

    // Expiration (optional - for auto-cleanup of old notifications)
    expiresAt: {
      type: Date,
      index: true,
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
inAppNotificationSchema.index({
  recipient: 1,
  recipientRole: 1,
  isRead: 1,
  createdAt: -1,
});
inAppNotificationSchema.index({
  recipient: 1,
  recipientRole: 1,
  createdAt: -1,
});
inAppNotificationSchema.index({
  recipientClinicSlug: 1,
  type: 1,
  createdAt: -1,
});
inAppNotificationSchema.index({ isRead: 1, createdAt: -1 });
inAppNotificationSchema.index({ type: 1, createdAt: -1 });
inAppNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Instance method to mark as read
inAppNotificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to get unread count
inAppNotificationSchema.statics.getUnreadCount = async function (
  recipientId,
  recipientRole,
) {
  return this.countDocuments({
    recipient: recipientId,
    recipientRole: recipientRole,
    isRead: false,
    isDeleted: false,
  });
};

// Static method to get recent notifications
inAppNotificationSchema.statics.getRecent = async function (
  recipientId,
  recipientRole,
  limit = 20,
  skip = 0,
) {
  return this.find({
    recipient: recipientId,
    recipientRole: recipientRole,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to mark all as read
inAppNotificationSchema.statics.markAllAsRead = async function (
  recipientId,
  recipientRole,
) {
  return this.updateMany(
    {
      recipient: recipientId,
      recipientRole: recipientRole,
      isRead: false,
    },
    {
      isRead: true,
      readAt: new Date(),
    },
  );
};

export default mongoose.model("InAppNotification", inAppNotificationSchema);
