import mongoose from "mongoose";
import { APPOINTMENT_STATUS } from "../utils/appointmentConstants.js";

const appointmentSchema = new mongoose.Schema(
  {
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
    date: {
      type: Date,
      required: true,
    },
    // Time slot for the appointment (e.g., "09:00", "14:30")
    // Defaults to "09:00" for backward compatibility with existing records
    timeSlot: {
      type: String,
      required: true,
      default: "09:00",
      validate: {
        validator: function (v) {
          // Validate HH:MM format
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: "timeSlot must be in HH:MM format (e.g., 09:00, 14:30)",
      },
    },
    rescheduleOptions: [
      {
        date: Date,
        timeSlot: {
          type: String,
          default: "09:00",
          validate: {
            validator: function (v) {
              return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
            },
            message: "timeSlot must be in HH:MM format",
          },
        },
        chosen: {
          type: Boolean,
          default: false,
        },
      },
    ],
    status: {
      type: String,
      enum: Object.values(APPOINTMENT_STATUS),
      default: APPOINTMENT_STATUS.PENDING,
      index: true,
    },
    notes: {
      type: String,
    },
    // Track status changes with timestamps
    statusHistory: [
      {
        status: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Limit rescheduling to once
    rescheduleCount: {
      type: Number,
      default: 0,
    },
    // Store who cancelled the appointment
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "cancelledByType",
    },
    cancelledByType: {
      type: String,
      enum: ["Doctor", "Patient"],
    },
    // Soft-delete support
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Patient dashboard visibility: allows patients to hide cancelled appointments
    // from their personal dashboard without deleting the record
    // Default false to maintain backward compatibility and ensure cancelled
    // appointments are visible by default
    hiddenByPatient: {
      type: Boolean,
      default: false,
      index: false,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for booking conflict prevention
appointmentSchema.index(
  { doctorId: 1, date: 1, timeSlot: 1 },
  { name: "unique_doctor_date_timeslot", unique: false }, // Non-unique to allow query optimization
);

// Index for patient lookups
appointmentSchema.index(
  { patientId: 1, status: 1 },
  { name: "patient_status_index" },
);

// Index for doctor lookups with status
appointmentSchema.index(
  { doctorId: 1, status: 1 },
  { name: "doctor_status_index" },
);

appointmentSchema.pre("save", async function () {
  // Always record status history
  if (this.isModified("status")) {
    if (!this.statusHistory) this.statusHistory = [];
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
    });
  }

  // Rule: A cancelled appointment cannot be changed
  if (
    !this.isNew &&
    this.status !== APPOINTMENT_STATUS.CANCELLED &&
    this.get("status", null, { original: true }) ===
      APPOINTMENT_STATUS.CANCELLED
  ) {
    throw new Error(
      "A cancelled appointment cannot be modified or rescheduled.",
    );
  }

  // Rule: If status is 'reschedule_proposed', there must be 3 options
  if (
    this.status === APPOINTMENT_STATUS.RESCHEDULE_PROPOSED &&
    (!this.rescheduleOptions || this.rescheduleOptions.length !== 3)
  ) {
    throw new Error(
      "A 'reschedule_proposed' appointment must have exactly 3 reschedule options.",
    );
  }

  // Rule: If status is 'confirmed' or 'scheduled' and rescheduleOptions exist, exactly one must be chosen
  // (No rescheduleOptions means patient already chose the time - direct accept workflow)
  const isConfirmedOrScheduled = [
    APPOINTMENT_STATUS.CONFIRMED,
    APPOINTMENT_STATUS.SCHEDULED,
  ].includes(this.status);
  if (isConfirmedOrScheduled) {
    if (this.rescheduleOptions && this.rescheduleOptions.length > 0) {
      const chosenCount = this.rescheduleOptions.filter(
        (opt) => opt.chosen,
      ).length;
      if (chosenCount !== 1) {
        throw new Error(
          "When reschedule options are present, exactly one must be chosen to confirm.",
        );
      }
    }
  }
});

// Post-save hook: Validate no duplicate doctor+date+timeSlot bookings (soft validation)
appointmentSchema.post("save", async function () {
  // Only validate for active appointments
  if (
    this.status !== APPOINTMENT_STATUS.CANCELLED &&
    this.status !== APPOINTMENT_STATUS.RESCHEDULE_PROPOSED
  ) {
    const duplicates = await Appointment.countDocuments({
      _id: { $ne: this._id }, // Exclude current appointment
      doctorId: this.doctorId,
      date: this.date,
      timeSlot: this.timeSlot,
      status: {
        $in: [
          APPOINTMENT_STATUS.PENDING,
          APPOINTMENT_STATUS.CONFIRMED,
          APPOINTMENT_STATUS.SCHEDULED,
        ],
      },
    });

    if (duplicates > 0) {
      // Document is already saved, but we throw to inform caller
      throw new Error("Time slot already booked. Please choose another time.");
    }
  }
});

const Appointment = mongoose.model("Appointment", appointmentSchema);
export default Appointment;
