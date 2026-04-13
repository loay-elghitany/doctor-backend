import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import logger from "../utils/logger.js";


const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    // WhatsApp phone number for notifications
    phoneNumber: {
      type: String,
      sparse: true, // Allow null/undefined for optional usage
      match:
        /^[+]?[(]?[0-9]{1,3}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,
      // Full international format: +1 (555) 123-4567 or +1234567890
    },

    clinicSlug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    plan: {
      type: String,
      enum: ["free", "basic", "pro"],
      default: "free",
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Manual account management flags
    // Used by admin to deactivate/reactivate doctor accounts
    // When isActive=false, doctor cannot create new appointments
    // Existing appointments are preserved when deactivated
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Track when account was deactivated (if applicable)
    deactivatedAt: {
      type: Date,
      default: null,
    },

    // Track last time doctor viewed timeline (for "new events" highlighting)
    lastTimelineViewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving if it's modified
doctorSchema.pre("save", async function () {
  // If password is not modified, proceed without hashing
  if (!this.isModified("password")) {
    return;
  }

  try {
    // Ensure password exists and is a string
    if (!this.password || typeof this.password !== "string") {
      throw new Error("Password must be a non-empty string");
    }

    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Method to compare passwords with input validation
doctorSchema.methods.matchPassword = async function (enteredPassword) {
  // Defensive: validate inputs
  if (!enteredPassword || typeof enteredPassword !== "string") {
    return false;
  }
  if (!this.password || typeof this.password !== "string") {
    return false;
  }

  try {
    return await bcryptjs.compare(enteredPassword, this.password);
  } catch (error) {
    // If bcrypt errors, fail authentication securely
    logger.error("Password comparison error:", error.message);
    return false;
  }
};

const Doctor = mongoose.model("Doctor", doctorSchema);
export default Doctor;
