import DoctorPrivateFile from "../models/DoctorPrivateFile.js";
import Patient from "../models/Patient.js";
import logger from "../utils/logger.js";

// Helper function to verify patient belongs to doctor's clinic
const verifyPatientOwnership = async (patientId, userClinicSlug) => {
  const patient = await Patient.findById(patientId);
  if (!patient) return false;

  // The Golden Rule: Isolation by clinicSlug
  return patient.clinicSlug === userClinicSlug;
};

// Get all private files for a specific patient (doctor only)
export const getPrivateFiles = async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.doctor._id;
    const userClinicSlug = req.doctor?.clinicSlug;

    // Verify patient belongs to doctor's clinic
    const isOwner = await verifyPatientOwnership(patientId, userClinicSlug);
    if (!isOwner) {
      return res.status(404).json({
        success: false,
        message: "Patient not found or not assigned to this clinic",
        data: null,
      });
    }

    // Fetch files sorted by newest first
    const files = await DoctorPrivateFile.find({
      patientId,
      doctorId,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Private files retrieved successfully",
      data: files,
    });
  } catch (error) {
    logger.error("getPrivateFiles error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};

// Create a new private file
export const createPrivateFile = async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.doctor._id;
    const userClinicSlug = req.doctor?.clinicSlug;
    const { title, fileUrl, fileType, notes } = req.body;

    // Validate required fields
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "File title is required",
        data: null,
      });
    }

    if (!fileUrl || fileUrl.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "File URL is required",
        data: null,
      });
    }

    if (!fileType || !["image", "pdf", "audio", "other"].includes(fileType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type",
        data: null,
      });
    }

    // Verify patient belongs to doctor's clinic
    const isOwner = await verifyPatientOwnership(patientId, userClinicSlug);
    if (!isOwner) {
      return res.status(404).json({
        success: false,
        message: "Patient not found or not assigned to this clinic",
        data: null,
      });
    }

    // Create the file record
    const file = await DoctorPrivateFile.create({
      patientId,
      doctorId,
      title: title.trim(),
      fileUrl: fileUrl.trim(),
      fileType,
      notes: notes ? notes.trim() : null,
    });

    res.status(201).json({
      success: true,
      message: "Private file created successfully",
      data: file,
    });
  } catch (error) {
    logger.error("createPrivateFile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};

// Delete a private file
export const deletePrivateFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { patientId } = req.body; // Include patientId in request body for ownership verification
    const doctorId = req.doctor._id;
    const userClinicSlug = req.doctor?.clinicSlug;

    // Verify patient belongs to doctor's clinic
    if (patientId) {
      const isOwner = await verifyPatientOwnership(patientId, userClinicSlug);
      if (!isOwner) {
        return res.status(404).json({
          success: false,
          message: "Patient not found or not assigned to this clinic",
          data: null,
        });
      }
    }

    // Delete the file, ensuring it belongs to the doctor
    const file = await DoctorPrivateFile.findOneAndDelete({
      _id: fileId,
      doctorId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Private file not found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Private file deleted successfully",
      data: null,
    });
  } catch (error) {
    logger.error("deletePrivateFile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};
