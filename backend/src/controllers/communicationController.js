import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";
import logger from "../utils/logger.js";



// GET /api/communication/whatsapp/patient/:patientId (doctor only)
export const getWhatsAppLinkForPatient = async (req, res) => {
  try {
    const doctor = req.user;
    const { patientId } = req.params;

    // Verify doctor has access to this patient
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }

    // Check if doctor is assigned to this patient
    if (String(patient.doctorId) !== String(doctor._id)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to communicate with this patient",
        data: null,
      });
    }

    if (!patient.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Patient phone number not available",
        data: null,
      });
    }

    // Generate WhatsApp link
    const phone = patient.phoneNumber.replace(/\D/g, ""); // Remove non-digits
    const message = encodeURIComponent("Hello Patient");
    const whatsappLink = `https://wa.me/${phone}?text=${message}`;

    res.json({
      success: true,
      data: {
        whatsappLink,
        patientName: patient.name,
        patientPhone: patient.phoneNumber,
      },
    });
  } catch (err) {
    logger.error(
      "getWhatsAppLinkForPatient",
      "Error generating WhatsApp link",
      err,
    );
    res.status(500).json({
      success: false,
      message: "Failed to generate WhatsApp link",
      data: null,
    });
  }
};

// GET /api/communication/whatsapp/doctor (patient only)
export const getWhatsAppLinkForDoctor = async (req, res) => {
  try {
    const patient = req.user;

    // Get assigned doctor
    const doctorId = patient.doctorId;
    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "No assigned doctor found",
        data: null,
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
        data: null,
      });
    }

    if (!doctor.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Doctor phone number not available",
        data: null,
      });
    }

    // Generate WhatsApp link
    const phone = doctor.phoneNumber.replace(/\D/g, ""); // Remove non-digits
    const message = encodeURIComponent("Hello Doctor");
    const whatsappLink = `https://wa.me/${phone}?text=${message}`;

    res.json({
      success: true,
      data: {
        whatsappLink,
        doctorName: doctor.name,
        doctorPhone: doctor.phoneNumber,
      },
    });
  } catch (err) {
    logger.error(
      "getWhatsAppLinkForDoctor",
      "Error generating WhatsApp link",
      err,
    );
    res.status(500).json({
      success: false,
      message: "Failed to generate WhatsApp link",
      data: null,
    });
  }
};
