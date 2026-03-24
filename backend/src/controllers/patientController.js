import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Login المريض
export const loginPatient = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ تحقق إن المريض موجود
    const patient = await Patient.findOne({ email }).select("+password");
    if (!patient)
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });

    // 2️⃣ تحقق كلمة السر
    const isMatch = await bcrypt.compare(password, patient.password);
    if (!isMatch)
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });

    // 3️⃣ اعمل JWT token (include assignedDoctorId if available for efficient resolution)
    const jwtPayload = {
      id: patient._id,
      role: "patient",
      doctorId: patient.doctorId,
    };
    // Add assignedDoctorId if present (for new patients auto-assigned)
    if (patient.assignedDoctorId) {
      jwtPayload.assignedDoctorId = patient.assignedDoctorId;
    }

    const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        patient: {
          id: patient._id,
          name: patient.name,
          email: patient.email,
        },
      },
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

// تسجيل المريض
export const registerPatient = async (req, res) => {
  try {
    const { clinicSlug } = req.params;
    const { name, email, password, phoneNumber } = req.body;

    // 1️⃣ تأكد إن الدكتور موجود
    const doctor = await Doctor.findOne({ clinicSlug });
    if (!doctor)
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
        data: null,
      });

    // 2️⃣ تحقق إن الإيميل مش موجود
    const existing = await Patient.findOne({ email });
    if (existing)
      return res.status(400).json({
        success: false,
        message: "Email already used",
        data: null,
      });

    // 3️⃣ إنشاء المريض (pre-save hook will hash the password)
    // assignedDoctorId is set to this clinic's doctor for auto-booking
    const patient = await Patient.create({
      name,
      email,
      password,
      doctorId: doctor._id,
      assignedDoctorId: doctor._id, // Auto-assign clinic doctor
      phoneNumber,
    });

    // Send WhatsApp notifications for new patient registration (Scenario 1)
    try {
      const doctorFromDb = await Doctor.findById(doctor._id);
      const doctorName = doctorFromDb?.name || "الدكتور";
      const patientName = patient?.name || "المريض";
      const patientPhone = patient?.phoneNumber || "غير متوفر";

      const doctorMessage = `مرحباً د. ${doctorName}، تم تسجيل مريض جديد في عيادتك 👤. الاسم: ${patientName} | 📞 الاتصال: ${patientPhone}.`;
      const patientMessage = `مرحباً ${patientName}، مرحباً بك في عيادة د. ${doctorName} 🏥. تم إنشاء حسابك بنجاح. يمكنك الآن حجز مواعيد وإدارة السجلات الطبية بسهولة.`;

      const doctorNotification = createAndSendNotification({
        recipientId: doctor._id,
        recipientType: "Doctor",
        type: "patient_registered",
        title: "مريض جديد مسجل",
        message: doctorMessage,
        doctorId: doctor._id,
        patientId: patient._id,
        actionUrl: `/doctor/patients`,
        metadata: {
          patientName,
          patientPhone,
        },
      });

      const patientNotification = createAndSendNotification({
        recipientId: patient._id,
        recipientType: "Patient",
        type: "patient_registered",
        title: "تم التسجيل بنجاح",
        message: patientMessage,
        doctorId: doctor._id,
        patientId: patient._id,
        actionUrl: `/patient/appointments`,
        metadata: {
          doctorName,
        },
      });

      await Promise.allSettled([doctorNotification, patientNotification]);
    } catch (notificationError) {
      console.error("[registerPatient] Failed to send notifications:", notificationError.message);
    }

    res.status(201).json({
      success: true,
      message: "Patient registered successfully!",
      data: { id: patient._id },
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

// جلب بروفايل المريض
export const getPatientProfile = async (req, res) => {
  try {
    // Guard: Ensure patient context
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const patient = await Patient.findById(req.user._id).select("-password");
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }
    res.json({
      success: true,
      message: "Patient profile retrieved successfully",
      data: patient,
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
