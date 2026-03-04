import Doctor from "../models/Doctor.js";
import jwt from "jsonwebtoken";
import { debugLog, debugError } from "../utils/debug.js";

// إنشاء دكتور جديد

export const createDoctor = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
        data: null,
      });
    }

    const clinicSlug = name.toLowerCase().replace(/\s+/g, "-");

    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: "Doctor already exists",
        data: null,
      });
    }

    const doctor = await Doctor.create({
      name,
      email,
      password,
      clinicSlug,
    });

    res.status(201).json({
      success: true,
      message: "Doctor created successfully",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        clinicSlug: doctor.clinicSlug,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Clinic slug already exists",
        data: null,
      });
    }

    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Login Doctor
export const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;
    debugLog("loginDoctor", "Login attempt", { email });

    // Validate input
    if (!email || !password) {
      debugLog("loginDoctor", "Missing email or password");
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
        data: null,
      });
    }

    // Find doctor and include password field for comparison
    debugLog("loginDoctor", "Finding doctor by email", { email });
    const doctor = await Doctor.findOne({ email }).select("+password");

    if (!doctor) {
      debugLog("loginDoctor", "Doctor not found", { email });
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    debugLog("loginDoctor", "Doctor found", { doctorId: doctor._id });

    // Defensive check: ensure password was provided by .select("+password")
    if (!doctor.password) {
      debugError("loginDoctor", "Password field missing from selected doctor", {
        doctorId: doctor._id,
      });
      // Don't leak that password is missing - use generic message
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    // Validate password with error protection
    let isPasswordValid = false;
    try {
      isPasswordValid = await doctor.matchPassword(password);
    } catch (bcryptError) {
      debugError("loginDoctor", "Password comparison error", bcryptError);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    if (!isPasswordValid) {
      debugLog("loginDoctor", "Password mismatch", { doctorId: doctor._id });
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    debugLog("loginDoctor", "Password valid", { doctorId: doctor._id });

    const token = generateToken(doctor._id, "doctor");
    debugLog("loginDoctor", "Token generated", {
      doctorId: doctor._id,
      role: "doctor",
      tokenLength: token.length,
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        doctor: {
          id: doctor._id,
          name: doctor.name,
          email: doctor.email,
          clinicSlug: doctor.clinicSlug,
        },
      },
    });

    debugLog("loginDoctor", "Login successful", { doctorId: doctor._id });
  } catch (error) {
    debugError("loginDoctor", "Unexpected error", error);
    // Don't leak error details in production
    const message =
      process.env.NODE_ENV === "development" ? error.message : "Server error";
    res.status(500).json({
      success: false,
      message,
      data: null,
    });
  }
};

/**
 * Get doctor profile
 * Protected route using doctorProtect middleware
 * Returns doctor info without password
 */
export const getDoctorProfile = async (req, res) => {
  try {
    debugLog("getDoctorProfile", "Fetching profile", {
      doctorId: req.user?._id,
    });

    if (!req.user) {
      debugError("getDoctorProfile", "req.user is missing");
      return res.status(401).json({
        success: false,
        message: "User context missing",
        data: null,
      });
    }

    const doctor = req.user;
    debugLog("getDoctorProfile", "Doctor object retrieved", {
      doctorId: doctor._id,
      name: doctor.name,
      email: doctor.email,
    });

    res.json({
      success: true,
      message: "Doctor profile retrieved",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        clinicSlug: doctor.clinicSlug,
        plan: doctor.plan,
        status: doctor.status,
      },
    });

    debugLog("getDoctorProfile", "Profile returned successfully");
  } catch (error) {
    debugError("getDoctorProfile", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

// Get all patients for a doctor with appointment summaries
export const getDoctorPatients = async (req, res) => {
  try {
    // Guard: Ensure doctor authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const doctorId = req.user._id;

    // Import here to avoid circular dependencies
    import("../models/Patient.js").then(async (module) => {
      const Patient = module.default;
      import("../models/Appointment.js").then(async (aptModule) => {
        const Appointment = aptModule.default;

        try {
          // Find all patients that have appointments with this doctor
          // Group by patient to avoid duplicates
          const appointmentsWithPatients = await Appointment.aggregate([
            {
              $match: { doctorId: doctorId },
            },
            {
              $group: {
                _id: "$patientId",
                totalAppointments: { $sum: 1 },
                lastAppointmentDate: { $max: "$date" },
                statuses: { $push: "$status" },
              },
            },
            {
              $sort: { lastAppointmentDate: -1 },
            },
          ]);

          if (
            !appointmentsWithPatients ||
            appointmentsWithPatients.length === 0
          ) {
            return res.json({
              success: true,
              message: "No patients found",
              data: [],
            });
          }

          // Get patient details
          const patientIds = appointmentsWithPatients.map((apt) => apt._id);
          const patients = await Patient.find({
            _id: { $in: patientIds },
            doctorId: doctorId,
          }).select("name email phone");

          // Combine patient data with appointment summaries
          const patientsWithSummary = patients.map((patient) => {
            const appointmentData = appointmentsWithPatients.find((apt) =>
              apt._id.equals(patient._id),
            );

            return {
              id: patient._id,
              name: patient.name,
              email: patient.email,
              phone: patient.phone || null,
              totalAppointments: appointmentData?.totalAppointments || 0,
              lastAppointmentDate: appointmentData?.lastAppointmentDate || null,
              statusSummary: appointmentData?.statuses || [],
            };
          });

          res.json({
            success: true,
            message: "Patients retrieved successfully",
            data: patientsWithSummary,
          });
        } catch (error) {
          console.error("Error in getDoctorPatients aggregation:", error);
          res.status(500).json({
            success: false,
            message: "Server error retrieving patients",
            data: null,
          });
        }
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

// Get appointments for a specific patient (for patient records detail view)
export const getPatientAppointmentsForDoctor = async (req, res) => {
  try {
    // Guard: Ensure doctor authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const { patientId } = req.params;
    const doctorId = req.user._id;

    import("../models/Appointment.js").then(async (aptModule) => {
      const Appointment = aptModule.default;

      try {
        const appointments = await Appointment.find({
          doctorId: doctorId,
          patientId: patientId,
        })
          .sort({ date: -1 })
          .select("date timeSlot status notes");

        res.json({
          success: true,
          message: "Patient appointments retrieved successfully",
          data: appointments,
        });
      } catch (error) {
        console.error("Error retrieving patient appointments:", error);
        res.status(500).json({
          success: false,
          message: "Server error retrieving appointments",
          data: null,
        });
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
