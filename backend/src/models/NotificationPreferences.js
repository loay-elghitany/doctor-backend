import mongoose from "mongoose";

/**
 * NotificationPreferences Model
 * User (Patient/Doctor) preferences for WhatsApp notifications
 * Allows opt-in/out for specific notification types
 * Supports SMS fallback configuration
 */
const notificationPreferencesSchema = new mongoose.Schema(
  {
    // User reference (Patient or Doctor)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    userType: {
      type: String,
      enum: ["Patient", "Doctor"],
      required: true,
      index: true,
    },

    // WhatsApp preferences
    whatsapp: {
      enabled: {
        type: Boolean,
        default: true,
      },

      // Per-type notification preferences
      types: {
        appointment_created: { type: Boolean, default: true },
        appointment_confirmed: { type: Boolean, default: true },
        appointment_cancelled: { type: Boolean, default: true },
        appointment_proposed: { type: Boolean, default: true },
        prescription_created: { type: Boolean, default: true },
      },

      // Quiet hours (optional)
      quietHoursEnabled: {
        type: Boolean,
        default: false,
      },

      quietHoursStart: {
        // HH:MM format, e.g., "22:00"
        type: String,
        default: "22:00",
      },

      quietHoursEnd: {
        // HH:MM format, e.g., "08:00"
        type: String,
        default: "08:00",
      },
    },

    // SMS fallback preferences
    sms: {
      enabled: {
        type: Boolean,
        default: false, // Disabled by default, user must opt-in
      },

      phoneNumber: {
        type: String,
        default: null, // Linked to user's phone field
      },

      // Per-type preferences
      types: {
        appointment_created: { type: Boolean, default: false },
        appointment_confirmed: { type: Boolean, default: false },
        appointment_cancelled: { type: Boolean, default: true },
        appointment_proposed: { type: Boolean, default: true },
        prescription_created: { type: Boolean, default: false },
      },

      fallbackOnly: {
        // Use SMS only if WhatsApp fails
        type: Boolean,
        default: true,
      },
    },

    // Email notification preferences (future)
    email: {
      enabled: {
        type: Boolean,
        default: false,
      },

      types: {
        appointment_created: { type: Boolean, default: true },
        appointment_confirmed: { type: Boolean, default: true },
        appointment_cancelled: { type: Boolean, default: true },
        appointment_proposed: { type: Boolean, default: true },
        prescription_created: { type: Boolean, default: true },
      },
    },

    // Global mute option
    muteAll: {
      type: Boolean,
      default: false,
    },

    // Do Not Track / GDPR opt-out
    gdprOptOut: {
      type: Boolean,
      default: false,
    },

    // Last preference update timestamp
    lastUpdated: {
      type: Date,
      default: Date.now,
    },

    // Tracking for audit
    updatedBy: {
      // "system" or user email
      type: String,
      default: "system",
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Unique index: one preference record per user
notificationPreferencesSchema.index(
  { userId: 1, userType: 1, isDeleted: 1 },
  { unique: true, sparse: true },
);

const NotificationPreferences = mongoose.model(
  "NotificationPreferences",
  notificationPreferencesSchema,
);

export default NotificationPreferences;
