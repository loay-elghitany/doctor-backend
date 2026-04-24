import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TreatmentPlan",
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    receivedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "receivedByModel",
    },
    receivedByModel: {
      type: String,
      required: true,
      enum: ["Doctor", "Secretary"],
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0.01,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card"],
      required: true,
      default: "cash",
    },
  },
  {
    timestamps: true,
  },
);

paymentSchema.index({ doctorId: 1, patientId: 1, planId: 1, date: -1 });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
