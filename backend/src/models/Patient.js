import mongoose from "mongoose";
import bcryptjs from "bcryptjs";

const patientSchema = new mongoose.Schema(
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
    },

    // WhatsApp phone number for notifications
    phoneNumber: {
      type: String,
      sparse: true, // Allow null/undefined for optional usage
      match:
        /^[+]?[(]?[0-9]{1,3}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,
    },

    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    // Clinic doctor auto-assigned at registration (optional for backward compatibility)
    assignedDoctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: false,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving if it's modified (same as Doctor model)
patientSchema.pre("save", async function () {
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

const Patient = mongoose.model("Patient", patientSchema);
export default Patient;
