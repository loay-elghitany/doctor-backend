import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorType: {
      type: String,
      enum: ["Admin", "Doctor", "Patient", "System"],
      required: true,
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: false },
    action: { type: String, required: true },
    resourceType: { type: String },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    reason: { type: String },
    meta: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
