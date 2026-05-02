import InAppNotification from "../models/InAppNotification.js";
import logger from "../utils/logger.js";
import { buildPagination, getPaginationParams } from "../utils/pagination.js";
import {
  emitNotificationToStaff,
  emitNotificationToPatient,
} from "../utils/socketManager.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import Secretary from "../models/Secretary.js";
import {
  sendTelegramMessage,
  formatTelegramMessage,
} from "../services/telegramService.js";
/**
 * Get notification history for authenticated user (uses InAppNotification)
 * Supports doctor, secretary, and patient contexts
 */
export const getNotificationHistory = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح - يرجى تسجيل الدخول",
        data: null,
      });
    }

    const { type } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const query = {
      recipient: user._id,
      recipientRole: user.role,
      isDeleted: false,
    };

    if (type) {
      query.type = type;
    }

    const totalItems = await InAppNotification.countDocuments(query);

    const notifications = await InAppNotification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const unreadCount = await InAppNotification.getUnreadCount(
      user._id,
      user.role,
    );

    res.json({
      success: true,
      message: "تم جلب الإشعارات بنجاح",
      data: notifications,
      unreadCount,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error(
      "getNotificationHistory",
      "Error fetching notification history",
      error,
    );
    res.status(500).json({
      success: false,
      message: "فشل في جلب الإشعارات",
      data: null,
    });
  }
};

/**
 * Get single notification details
 */
export const getNotificationDetails = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const notification = await InAppNotification.findOne({
      _id: notificationId,
      recipient: user._id,
      recipientRole: user.role,
      isDeleted: false,
    }).lean();

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "الإشعار غير موجود",
        data: null,
      });
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    logger.error(
      "getNotificationDetails",
      "Error fetching notification details",
      error,
    );
    res.status(500).json({
      success: false,
      message: "فشل في جلب تفاصيل الإشعار",
      data: null,
    });
  }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const notification = await InAppNotification.findOneAndUpdate(
      {
        _id: notificationId,
        recipient: user._id,
        recipientRole: user.role,
        isDeleted: false,
      },
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "الإشعار غير موجود",
        data: null,
      });
    }

    res.json({
      success: true,
      message: "تم تحديد الإشعار كمقروء",
      data: notification,
    });
  } catch (error) {
    logger.error(
      "markNotificationAsRead",
      "Error marking notification as read",
      error,
    );
    res.status(500).json({
      success: false,
      message: "فشل في تحديد الإشعار كمقروء",
      data: null,
    });
  }
};

/**
 * Get notification statistics for user
 */
export const getNotificationStats = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const baseMatch = {
      recipient: user._id,
      recipientRole: user.role,
      isDeleted: false,
    };

    const [typeCounts, unreadCount, totalCount] = await Promise.all([
      InAppNotification.aggregate([
        { $match: baseMatch },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      InAppNotification.getUnreadCount(user._id, user.role),
      InAppNotification.countDocuments(baseMatch),
    ]);

    const stats = {
      byType: {},
      unread: unreadCount,
      total: totalCount,
    };

    typeCounts.forEach((item) => {
      stats.byType[item._id] = item.count;
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(
      "getNotificationStats",
      "Error fetching notification statistics",
      error,
    );
    res.status(500).json({
      success: false,
      message: "فشل في جلب إحصائيات الإشعارات",
      data: null,
    });
  }
};

/**
 * Delete notification (soft delete)
 */
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const notification = await InAppNotification.findOneAndUpdate(
      {
        _id: notificationId,
        recipient: user._id,
        recipientRole: user.role,
        isDeleted: false,
      },
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "الإشعار غير موجود",
        data: null,
      });
    }

    res.json({
      success: true,
      message: "تم حذف الإشعار",
      data: { id: notification._id },
    });
  } catch (error) {
    logger.error("deleteNotification", "Error deleting notification", error);
    res.status(500).json({
      success: false,
      message: "فشل في حذف الإشعار",
      data: null,
    });
  }
};

/**
 * Admin: Get all notifications (for monitoring/debugging)
 */
export const getAllNotifications = async (req, res) => {
  try {
    const { type, recipientRole, limit = 100, offset = 0 } = req.query;
    const query = { isDeleted: false };

    if (type) query.type = type;
    if (recipientRole) query.recipientRole = recipientRole;

    const total = await InAppNotification.countDocuments(query);

    const notifications = await InAppNotification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    res.json({
      success: true,
      data: {
        notifications,
        pagination: { total, limit: parseInt(limit), offset: parseInt(offset) },
      },
    });
  } catch (error) {
    logger.error(
      "getAllNotifications",
      "Error fetching all notifications",
      error,
    );
    res.status(500).json({
      success: false,
      message: "فشل في جلب الإشعارات",
      data: null,
    });
  }
};

// =============================================================================
// IN-APP NOTIFICATION FUNCTIONS (Persistent Real-time Notifications)
// =============================================================================

/**
 * Create and persist an in-app notification
 * Also emits real-time via Socket.io if user is online
 * @param {Object} data - Notification data
 * @returns {Promise<Object>} Created notification
 */
export const createInAppNotification = async (data) => {
  try {
    const {
      recipient,
      recipientRole,
      recipientClinicSlug,
      sender,
      senderRole,
      senderName,
      type,
      category,
      title,
      message,
      link,
      linkType,
      appointmentId,
      patientId,
      doctorId,
      prescriptionId,
    } = data;

    // Create notification in database
    const notification = await InAppNotification.create({
      recipient,
      recipientRole,
      recipientClinicSlug,
      sender,
      senderRole,
      senderName,
      type,
      category,
      title,
      message,
      link,
      linkType,
      appointmentId,
      patientId,
      doctorId,
      prescriptionId,
      isRead: false,
    });

    console.log(
      "[InAppNotification] Created:",
      notification._id,
      "for",
      recipientRole,
      recipient,
    );

    // Emit real-time notification if applicable
    try {
      if (recipientRole === "doctor" || recipientRole === "secretary") {
        if (recipientClinicSlug) {
          emitNotificationToStaff(recipientClinicSlug, {
            id: notification._id,
            type,
            title,
            message,
            timestamp: notification.createdAt,
            link,
          });
        }
      } else if (recipientRole === "patient") {
        emitNotificationToPatient(recipient.toString(), {
          id: notification._id,
          type,
          title,
          message,
          timestamp: notification.createdAt,
          link,
        });
      }
    } catch (socketError) {
      console.error(
        "[InAppNotification] Socket emit failed:",
        socketError.message,
      );
      // Don't fail if socket emit fails - notification is already persisted
    }

    // Fire-and-forget: Send Telegram notification asynchronously
    // This block never blocks the response and never throws
    (async () => {
      try {
        let telegramChatId = null;
        let userModel = null;

        // Fetch user based on recipientRole to get their Telegram Chat ID
        if (recipientRole === "doctor") {
          userModel = await Doctor.findById(recipient).select("telegramChatId");
        } else if (recipientRole === "secretary") {
          userModel =
            await Secretary.findById(recipient).select("telegramChatId");
        } else if (recipientRole === "patient") {
          userModel =
            await Patient.findById(recipient).select("telegramChatId");
        }

        telegramChatId = userModel?.telegramChatId;

        // If user has Telegram Chat ID, send notification
        if (telegramChatId) {
          const formattedMessage = formatTelegramMessage(title, message);
          await sendTelegramMessage(telegramChatId, formattedMessage);

          logger.debug("[InAppNotification] Telegram message queued", {
            recipientRole,
            recipientId: recipient,
            notificationId: notification._id,
          });
        }
      } catch (telegramError) {
        // Log but never throw - Telegram is optional
        logger.error(
          "[InAppNotification] Telegram notification failed:",
          telegramError.message,
        );
      }
    })();

    return notification;
  } catch (error) {
    console.error("[InAppNotification] Creation failed:", error.message);
    throw error;
  }
};

/**
 * Get in-app notifications for authenticated user
 * GET /api/inapp-notifications
 */
export const getInAppNotifications = async (req, res) => {
  try {
    // Determine user from auth middleware
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح - يرجى تسجيل الدخول",
        data: null,
      });
    }

    const { limit = 20, skip = 0, unreadOnly = false } = req.query;

    const query = {
      recipient: user._id,
      recipientRole: user.role,
      isDeleted: false,
    };

    if (unreadOnly === "true") {
      query.isRead = false;
    }

    const notifications = await InAppNotification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const unreadCount = await InAppNotification.getUnreadCount(
      user._id,
      user.role,
    );

    res.json({
      success: true,
      message: "تم جلب الإشعارات بنجاح",
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    console.error("[getInAppNotifications] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل في جلب الإشعارات",
      data: null,
    });
  }
};

/**
 * Get unread count for current user
 * GET /api/inapp-notifications/unread-count
 */
export const getInAppUnreadCount = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const count = await InAppNotification.getUnreadCount(user._id, user.role);

    res.json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error("[getInAppUnreadCount] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل في جلب عدد الإشعارات غير المقروءة",
      data: null,
    });
  }
};

/**
 * Mark single notification as read
 * PATCH /api/inapp-notifications/:id/read
 */
export const markInAppNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const notification = await InAppNotification.findOneAndUpdate(
      {
        _id: id,
        recipient: user._id,
        recipientRole: user.role,
        isDeleted: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "الإشعار غير موجود",
        data: null,
      });
    }

    res.json({
      success: true,
      message: "تم تحديد الإشعار كمقروء",
      data: notification,
    });
  } catch (error) {
    console.error("[markInAppNotificationAsRead] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل في تحديد الإشعار كمقروء",
      data: null,
    });
  }
};

/**
 * Mark all notifications as read
 * PATCH /api/inapp-notifications/mark-all-read
 */
export const markAllInAppNotificationsAsRead = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const result = await InAppNotification.markAllAsRead(user._id, user.role);

    res.json({
      success: true,
      message: "تم تحديد جميع الإشعارات كمقروءة",
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error("[markAllInAppNotificationsAsRead] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل في تحديد الإشعارات كمقروءة",
      data: null,
    });
  }
};

/**
 * Delete in-app notification (soft delete)
 * DELETE /api/inapp-notifications/:id
 */
export const deleteInAppNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
        data: null,
      });
    }

    const notification = await InAppNotification.findOneAndUpdate(
      {
        _id: id,
        recipient: user._id,
        recipientRole: user.role,
        isDeleted: false,
      },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "الإشعار غير موجود",
        data: null,
      });
    }

    res.json({
      success: true,
      message: "تم حذف الإشعار",
      data: { id: notification._id },
    });
  } catch (error) {
    console.error("[deleteInAppNotification] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل في حذف الإشعار",
      data: null,
    });
  }
};

// =============================================================================
// HELPER FUNCTIONS FOR CREATING NOTIFICATIONS IN CONTROLLERS
// =============================================================================

/**
 * Notify clinic staff (doctor + secretaries) about a new appointment
 * @param {String} clinicSlug - The clinic identifier
 * @param {Object} appointment - Appointment data
 * @param {Object} patient - Patient data
 */
export const notifyStaffNewAppointment = async (
  clinicSlug,
  appointment,
  patient,
) => {
  const formattedDate = new Date(appointment.date).toLocaleDateString("ar-SA");

  // Find the doctor to get their ID for notification
  const doctorId = appointment.doctorId;

  await createInAppNotification({
    recipient: doctorId,
    recipientRole: "doctor",
    recipientClinicSlug: clinicSlug,
    sender: patient._id,
    senderRole: "patient",
    senderName: patient.name,
    type: "NEW_APPOINTMENT",
    category: "appointment",
    title: "طلب موعد",
    message: `طلب موعد: المريض ${patient.name} يطلب حجز موعد يوم ${formattedDate} الساعة ${appointment.timeSlot}`,
    link: `/appointments/${appointment._id}`,
    linkType: "appointment",
    appointmentId: appointment._id,
    patientId: patient._id,
    doctorId: doctorId,
  });
};

/**
 * Notify patient about appointment status change
 * @param {String} patientId - Patient ID
 * @param {String} status - New status (accepted, rejected, etc.)
 * @param {Object} appointment - Appointment data
 * @param {String} doctorName - Doctor's name
 */
export const notifyPatientAppointmentStatus = async (
  patientId,
  status,
  appointment,
  doctorName,
) => {
  const statusMessages = {
    accepted: {
      title: "تم قبول الموعد",
      message: `تم قبول موعدك مع د. ${doctorName}. نتمنى لك الشفاء العاجل!`,
      type: "APPOINTMENT_ACCEPTED",
    },
    rejected: {
      title: "تم رفض الموعد",
      message: `تم رفض موعدك مع د. ${doctorName}. يرجى حجز موعد آخر.`,
      type: "APPOINTMENT_REJECTED",
    },
    rescheduled: {
      title: "تم إعادة جدولة الموعد",
      message: `تم تغيير موعدك مع د. ${doctorName}. يرجى مراجعة التفاصيل.`,
      type: "APPOINTMENT_RESCHEDULED",
    },
    completed: {
      title: "تم إنجاز الموعد",
      message: `تم إنجاز موعدك مع د. ${doctorName}. نتمنى لك دوام الصحة!`,
      type: "APPOINTMENT_COMPLETED",
    },
  };

  const statusData = statusMessages[status] || statusMessages.accepted;

  await createInAppNotification({
    recipient: patientId,
    recipientRole: "patient",
    senderRole: "doctor",
    senderName: doctorName,
    type: statusData.type,
    category: "appointment",
    title: statusData.title,
    message: statusData.message,
    link: `/patient/appointments/${appointment._id}`,
    linkType: "appointment",
    appointmentId: appointment._id,
    patientId: patientId,
    doctorId: appointment.doctorId,
  });
};

/**
 * Notify staff about new patient registration
 * Notifies entire clinic staff room instead of just the doctor
 * @param {String} clinicSlug - Clinic identifier
 * @param {Object} patient - New patient data
 */
export const notifyStaffNewPatient = async (clinicSlug, patient) => {
  try {
    const doctor = await Doctor.findById(
      patient.doctorId || patient.assignedDoctorId,
    );

    if (!doctor || !doctor.clinicSlug) {
      logger.warn("[notifyStaffNewPatient] Doctor or clinicSlug not found", {
        patientId: patient._id,
        doctorId: patient.doctorId,
      });
      return;
    }

    const resolvedClinicSlug = clinicSlug || doctor.clinicSlug;

    // Emit to clinic staff room so ALL doctors and secretaries in the clinic are notified
    const notification = {
      recipient: clinicSlug,
      recipientRole: "clinic_staff",
      recipientClinicSlug: clinicSlug,

      sender: patient._id,
      senderRole: "patient",
      senderName: patient.name,
      type: "NEW_PATIENT_REGISTERED",
      category: "patient",
      title: "مريض جديد",
      message: `مريض جديد: قام ${patient.name} بإنشاء حساب جديد. الهاتف: ${patient.phoneNumber || "لا يوجد رقم"}`,

      // 2. خلينا الرابط محايد، الفرونت-أند هياخده ويحط قبله /doctor أو /secretary حسب اللي فاتح
      link: `/patients/${patient._id}`,
      linkType: "patient",

      patientId: patient._id,
      doctorId: patient.doctorId,
      isRead: false,
    };
    // Save notification for primary doctor
    await InAppNotification.create({
      ...notification,
      recipient: patient.doctorId || patient.assignedDoctorId,
      recipientRole: "doctor",
    });

    // Emit to clinic-wide staff room for real-time updates
    emitNotificationToStaff(resolvedClinicSlug, {
      id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      timestamp: new Date().toISOString(),
      link: notification.link,
      patientName: patient.name,
      patientPhone: patient.phoneNumber,
    });

    logger.debug("[notifyStaffNewPatient] Notification sent to clinic staff", {
      clinicSlug: resolvedClinicSlug,
      patientId: patient._id,
      patientName: patient.name,
    });
  } catch (error) {
    logger.error(
      "[notifyStaffNewPatient] Failed to notify staff:",
      error.message,
    );
    // Don't fail if notification fails
  }
};

/**
 * Notify patient about new prescription
 * @param {String} patientId - Patient ID
 * @param {Object} prescription - Prescription data
 * @param {String} doctorName - Doctor's name
 */
export const notifyPatientNewPrescription = async (
  patientId,
  prescription,
  doctorName,
) => {
  await createInAppNotification({
    recipient: patientId,
    recipientRole: "patient",
    senderRole: "doctor",
    senderName: doctorName,
    type: "NEW_PRESCRIPTION",
    category: "prescription",
    title: "روشتة جديدة",
    message: `قام د. ${doctorName} بكتابة روشتة جديدة لك. يرجى مراجعة التفاصيل.`,
    link: `/patient/prescriptions/${prescription._id}`,
    linkType: "prescription",
    prescriptionId: prescription._id,
    patientId: patientId,
  });
};
