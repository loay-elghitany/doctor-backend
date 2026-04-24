import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import logger from "../utils/logger.js";

const isValidHttpUrl = (value) => {
  if (!value) return true;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
};

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

    bio: {
      type: String,
      default: "",
      trim: true,
    },

    specialty: {
      type: String,
      default: "",
      trim: true,
    },

    profilePicture: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: isValidHttpUrl,
        message: "profilePicture must be a valid HTTP/HTTPS URL",
      },
    },

    coverImage: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: isValidHttpUrl,
        message: "coverImage must be a valid HTTP/HTTPS URL",
      },
    },

    coverImage: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: isValidHttpUrl,
        message: "coverImage must be a valid HTTP/HTTPS URL",
      },
    },

    clinicPhotos: {
      type: [
        {
          type: String,
          trim: true,
          validate: {
            validator: isValidHttpUrl,
            message: "clinicPhotos contains an invalid HTTP/HTTPS URL",
          },
        },
      ],
      default: [],
    },

    socialLinks: {
      facebook: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator: isValidHttpUrl,
          message: "socialLinks.facebook must be a valid HTTP/HTTPS URL",
        },
      },
      instagram: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator: isValidHttpUrl,
          message: "socialLinks.instagram must be a valid HTTP/HTTPS URL",
        },
      },
      twitter: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator: isValidHttpUrl,
          message: "socialLinks.twitter must be a valid HTTP/HTTPS URL",
        },
      },
    },

    landingPageSettings: {
      themeColor: { type: String, default: "#2563eb", trim: true },
      welcomeMessage: { type: String, default: "", trim: true },
    },

    plan: {
      type: String,
      enum: ["free", "basic", "pro"],
      default: "free",
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

doctorSchema.virtual("status").get(function () {
  return this.isActive ? "active" : "inactive";
});

doctorSchema.set("toJSON", { virtuals: true });
doctorSchema.set("toObject", { virtuals: true });

const Doctor = mongoose.model("Doctor", doctorSchema);
export default Doctor;
