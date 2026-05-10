import PrivateNote from "../models/PrivateNote.js";
import Patient from "../models/Patient.js";
import logger from "../utils/logger.js";

// Helper function to verify patient belongs to doctor's clinic
const verifyPatientOwnership = async (patientId, userClinicSlug) => {
  const patient = await Patient.findById(patientId);
  if (!patient) return false;

  // The Golden Rule: Isolation by clinicSlug
  return patient.clinicSlug === userClinicSlug;
};

// Get all private notes for a specific patient (doctor only)
export const getPrivateNotes = async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.user._id;
    const userClinicSlug = req.user?.clinicSlug || req.doctor?.clinicSlug;

    // Verify patient belongs to doctor's clinic
    const isOwner = await verifyPatientOwnership(patientId, userClinicSlug);
    if (!isOwner) {
      return res.status(404).json({
        success: false,
        message: "Patient not found or not assigned to this clinic",
        data: null,
      });
    }

    // Fetch notes, pinned first, then by creation date
    const notes = await PrivateNote.find({ patientId, doctorId }).sort({
      isPinned: -1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      message: "Private notes retrieved successfully",
      data: notes,
    });
  } catch (error) {
    logger.error("getPrivateNotes error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};

// Create a new private note
export const createPrivateNote = async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.user._id;
    const userClinicSlug = req.user?.clinicSlug || req.doctor?.clinicSlug;
    const { content, color, isPinned } = req.body;

    // Validate required fields
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Note content is required",
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

    // Create the note
    const note = await PrivateNote.create({
      patientId,
      doctorId,
      content: content.trim(),
      color: color || "yellow",
      isPinned: isPinned || false,
    });

    res.status(201).json({
      success: true,
      message: "Private note created successfully",
      data: note,
    });
  } catch (error) {
    logger.error("createPrivateNote error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};

// Update a private note
export const updatePrivateNote = async (req, res) => {
  try {
    const { patientId, noteId } = req.params;
    const doctorId = req.user._id;
    const userClinicSlug = req.user?.clinicSlug || req.doctor?.clinicSlug;
    const { content, color, isPinned } = req.body;

    // Allow partial updates - no strict validation for content
    // Only validate if content is provided and empty
    if (content !== undefined && (!content || content.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Note content cannot be empty if provided",
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

    // Build update object with only provided fields
    const updateData = {};
    if (content !== undefined) updateData.content = content.trim();
    if (color !== undefined) updateData.color = color;
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    // Update the note, ensuring it belongs to the doctor
    const note = await PrivateNote.findOneAndUpdate(
      { _id: noteId, patientId, doctorId },
      updateData,
      { new: true },
    );

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Private note not found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Private note updated successfully",
      data: note,
    });
  } catch (error) {
    logger.error("updatePrivateNote error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};

// Delete a private note
export const deletePrivateNote = async (req, res) => {
  try {
    const { patientId, noteId } = req.params;
    const doctorId = req.user._id;
    const userClinicSlug = req.user?.clinicSlug || req.doctor?.clinicSlug;

    // Verify patient belongs to doctor's clinic
    const isOwner = await verifyPatientOwnership(patientId, userClinicSlug);
    if (!isOwner) {
      return res.status(404).json({
        success: false,
        message: "Patient not found or not assigned to this clinic",
        data: null,
      });
    }

    // Delete the note, ensuring it belongs to the doctor
    const note = await PrivateNote.findOneAndDelete({
      _id: noteId,
      patientId,
      doctorId,
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Private note not found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Private note deleted successfully",
      data: null,
    });
  } catch (error) {
    logger.error("deletePrivateNote error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};
