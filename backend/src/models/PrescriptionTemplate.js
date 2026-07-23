import mongoose from "mongoose";

const prescriptionTemplateSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },

    templateName: {
      type: String,
      required: true,
      trim: true,
    },

    diagnosis: {
      type: String,
      default: null,
    },

    medications: [
      {
        name: {
          type: String,
          default: null,
        },
        dosage: {
          type: String,
          default: null,
        },
        frequency: {
          type: String,
          default: null,
        },
        duration: {
          type: String,
          default: null,
        },
        instructions: {
          type: String,
          default: null,
        },
      },
    ],

    notes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

prescriptionTemplateSchema.index(
  { doctorId: 1, templateName: 1 },
  { name: "doctor_template_name_index" },
);

const PrescriptionTemplate = mongoose.model(
  "PrescriptionTemplate",
  prescriptionTemplateSchema,
);

export default PrescriptionTemplate;
