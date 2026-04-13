import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import logger from "../utils/logger.js";


const secretarySchema = new mongoose.Schema(
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
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["secretary"],
      default: "secretary",
      immutable: true,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
secretarySchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  if (!this.password || typeof this.password !== "string") {
    throw new Error("Password must be a non-empty string");
  }

  const salt = await bcryptjs.genSalt(10);
  this.password = await bcryptjs.hash(this.password, salt);
});

// Password compare
secretarySchema.methods.matchPassword = async function (enteredPassword) {
  if (!enteredPassword || typeof enteredPassword !== "string") return false;
  if (!this.password || typeof this.password !== "string") return false;
  try {
    return await bcryptjs.compare(enteredPassword, this.password);
  } catch (err) {
    logger.error("Secretary password comparison error:", err.message);
    return false;
  }
};

const Secretary = mongoose.model("Secretary", secretarySchema);
export default Secretary;
