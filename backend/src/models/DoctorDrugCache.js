import mongoose from "mongoose";

const doctorDrugCacheSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

doctorDrugCacheSchema.index(
  { doctorId: 1, name: 1 },
  { unique: true, name: "doctor_drug_cache_unique_index" },
);

const DoctorDrugCache = mongoose.model(
  "DoctorDrugCache",
  doctorDrugCacheSchema,
);

export default DoctorDrugCache;
