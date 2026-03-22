import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    title: { type: String, required: true }, // اسم التحليل أو التقرير
    description: { type: String }, // وصف إضافي
    fileUrl: { type: String }, // لو فيه ملف PDF أو صورة
  },
  { timestamps: true },
);

const Report = mongoose.model("Report", reportSchema);

export default Report;
