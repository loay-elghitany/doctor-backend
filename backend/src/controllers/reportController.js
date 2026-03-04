import Report from "../models/Report.js";

// إضافة تقرير جديد
export const createReport = async (req, res) => {
  try {
    // Guard: Ensure required context
    if (!req.tenantId || !req.patientId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const { title, description, fileUrl } = req.body;

    const report = await Report.create({
      doctorId: req.tenantId,
      patientId: req.patientId,
      title,
      description,
      fileUrl,
    });

    res.status(201).json({
      success: true,
      message: "Report created successfully",
      data: report,
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

// جلب كل التقارير لمريض معين
export const getReports = async (req, res) => {
  try {
    // Guard: Ensure required context
    if (!req.tenantId || !req.patientId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const reports = await Report.find({
      doctorId: req.tenantId,
      patientId: req.patientId,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Reports retrieved successfully",
      data: reports,
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
