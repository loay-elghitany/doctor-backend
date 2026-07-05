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
const getClinicSecretaries = async (clinicSlug) => {
  if (!clinicSlug) {
    return [];
  }
  // Find doctor by clinicSlug first, then find all secretaries for that doctor
  const doctor = await Doctor.findOne({ clinicSlug }).select("_id");
  if (!doctor) {
    return [];
  }
  return Secretary.find({ doctorId: doctor._id }).select("_id").lean();
};

const notifyClinicStaff = async ({
  clinicSlug,
  doctorId,
  notifyDoctor = false,
  notifySecretaries = false,
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
  prescriptionId,
}) => {
  const recipients = [];
  if (notifyDoctor && doctorId) {
    recipients.push({ recipient: doctorId, recipientRole: "doctor" });
  }

  if (notifySecretaries && clinicSlug) {
    const secretaries = await getClinicSecretaries(clinicSlug);
    for (const secretary of secretaries) {
      recipients.push({ recipient: secretary._id, recipientRole: "secretary" });
    }
  }

  if (recipients.length === 0) {
    return;
  }

  const createPromises = recipients.map(({ recipient, recipientRole }) =>
    createInAppNotification({
      recipient,
      recipientRole,
      recipientClinicSlug: clinicSlug,
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
    }),
  );

  const settled = await Promise.allSettled(createPromises);
  const firstFulfilled = settled.find(
    (result) => result.status === "fulfilled",
  );
  if (clinicSlug && firstFulfilled?.status === "fulfilled") {
    emitNotificationToStaff(clinicSlug, {
      id: firstFulfilled.value._id,
      type,
      title,
      message,
      timestamp: new Date().toISOString(),
      link,
    });
  }
};

const getStaffNotificationFlags = (senderRole) => {
  if (senderRole === "doctor") {
    return { notifyDoctor: false, notifySecretaries: true };
  }
  if (senderRole === "secretary") {
    return { notifyDoctor: true, notifySecretaries: false };
  }
  return { notifyDoctor: true, notifySecretaries: true };
};

export const notifyStaffNewAppointment = async (
  clinicSlug,
  appointment,
  patient,
) => {
  const formattedDate = new Date(appointment.date).toLocaleDateString(
    "ar-EG-u-ca-gregory",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const doctorId = appointment.doctorId;

  await notifyClinicStaff({
    clinicSlug,
    doctorId,
    notifyDoctor: true,
    notifySecretaries: true,
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
    doctorId,
  });
};

export const notifyStaffAppointmentConfirmed = async (
  clinicSlug,
  appointment,
  patient,
  senderRole,
  senderId,
  senderName,
) => {
  const formattedDate = new Date(appointment.date).toLocaleDateString(
    "ar-EG-u-ca-gregory",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const doctorId = appointment.doctorId;
  const flags = getStaffNotificationFlags(senderRole);
  const roleLabel =
    senderRole === "secretary"
      ? "السكرتيرة"
      : senderRole === "doctor"
        ? "الدكتور"
        : "المريض";

  await notifyClinicStaff({
    clinicSlug,
    doctorId,
    notifyDoctor: flags.notifyDoctor,
    notifySecretaries: flags.notifySecretaries,
    sender: senderId,
    senderRole,
    senderName,
    type: "APPOINTMENT_CONFIRMED",
    category: "appointment",
    title: "تم تأكيد الموعد",
    message: `${roleLabel} ${senderName} قام بتأكيد موعد المريض ${patient.name} يوم ${formattedDate} الساعة ${appointment.timeSlot}`,
    link: `/appointments/${appointment._id}`,
    linkType: "appointment",
    appointmentId: appointment._id,
    patientId: patient._id,
    doctorId,
  });
};

export const notifyStaffAppointmentCancelled = async (
  clinicSlug,
  appointment,
  patient,
  senderRole,
  senderId,
  senderName,
) => {
  const formattedDate = new Date(appointment.date).toLocaleDateString(
    "ar-EG-u-ca-gregory",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const doctorId = appointment.doctorId;
  const flags = getStaffNotificationFlags(senderRole);
  const roleLabel =
    senderRole === "secretary"
      ? "السكرتيرة"
      : senderRole === "doctor"
        ? "الدكتور"
        : "المريض";

  await notifyClinicStaff({
    clinicSlug,
    doctorId,
    notifyDoctor: flags.notifyDoctor,
    notifySecretaries: flags.notifySecretaries,
    sender: senderId,
    senderRole,
    senderName,
    type: "APPOINTMENT_CANCELLED",
    category: "appointment",
    title: "تم إلغاء الموعد",
    message: `${roleLabel} ${senderName} قام بإلغاء موعد المريض ${patient.name} المقرر يوم ${formattedDate} الساعة ${appointment.timeSlot}`,
    link: `/appointments/${appointment._id}`,
    linkType: "appointment",
    appointmentId: appointment._id,
    patientId: patient._id,
    doctorId,
  });
};

export const notifyStaffAppointmentProposed = async (
  clinicSlug,
  appointment,
  patient,
  senderRole,
  senderId,
  senderName,
) => {
  const doctorId = appointment.doctorId;
  const flags = getStaffNotificationFlags(senderRole);
  const roleLabel =
    senderRole === "secretary"
      ? "السكرتيرة"
      : senderRole === "doctor"
        ? "الدكتور"
        : "المريض";

  await notifyClinicStaff({
    clinicSlug,
    doctorId,
    notifyDoctor: flags.notifyDoctor,
    notifySecretaries: flags.notifySecretaries,
    sender: senderId,
    senderRole,
    senderName,
    type: "APPOINTMENT_PROPOSED",
    category: "appointment",
    title: "تم اقتراح موعد جديد",
    message: `${roleLabel} ${senderName} اقترح مواعيد جديدة للمريض ${patient.name} لمراجعة جدول الموعد.`,
    link: `/appointments/${appointment._id}`,
    linkType: "appointment",
    appointmentId: appointment._id,
    patientId: patient._id,
    doctorId,
  });
};

export const notifyStaffAppointmentCompleted = async (
  clinicSlug,
  appointment,
  patient,
  senderRole,
  senderId,
  senderName,
) => {
  const formattedDate = new Date(appointment.date).toLocaleDateString(
    "ar-EG-u-ca-gregory",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const doctorId = appointment.doctorId;
  const flags = getStaffNotificationFlags(senderRole);
  const roleLabel =
    senderRole === "secretary"
      ? "السكرتيرة"
      : senderRole === "doctor"
        ? "الدكتور"
        : "المريض";

  await notifyClinicStaff({
    clinicSlug,
    doctorId,
    notifyDoctor: flags.notifyDoctor,
    notifySecretaries: flags.notifySecretaries,
    sender: senderId,
    senderRole,
    senderName,
    type: "APPOINTMENT_COMPLETED",
    category: "appointment",
    title: "تم إنجاز الموعد",
    message: `${roleLabel} ${senderName} أكمل موعد المريض ${patient.name} بتاريخ ${formattedDate} الساعة ${appointment.timeSlot}`,
    link: `/appointments/${appointment._id}`,
    linkType: "appointment",
    appointmentId: appointment._id,
    patientId: patient._id,
    doctorId,
  });
};

export const notifyStaffNewPrescription = async (
  clinicSlug,
  prescription,
  patient,
  doctor,
) => {
  const doctorName = doctor.name || "الدكتور";
  const message = `د. ${doctorName} أضاف روشتة جديدة للمريض ${patient.name}.`;
  await notifyClinicStaff({
    clinicSlug,
    doctorId: doctor._id,
    notifyDoctor: false,
    notifySecretaries: true,
    sender: doctor._id,
    senderRole: "doctor",
    senderName: doctorName,
    type: "NEW_PRESCRIPTION",
    category: "prescription",
    title: "روشتة جديدة",
    message,
    link: `/prescriptions/${prescription._id}`,
    linkType: "prescription",
    appointmentId: prescription.appointmentId,
    patientId: patient._id,
    doctorId: doctor._id,
    prescriptionId: prescription._id,
  });
};

export const notifyStaffFinancialPlanCreated = async (
  clinicSlug,
  plan,
  patient,
  doctor,
  senderRole = "doctor",
  senderId,
  senderName,
) => {
  const doctorName = doctor.name || "الدكتور";
  const flags = getStaffNotificationFlags(senderRole);
  const effectiveSenderId = senderId || doctor._id;
  const effectiveSenderName = senderName || doctorName;

  await notifyClinicStaff({
    clinicSlug,
    doctorId: doctor._id,
    notifyDoctor: flags.notifyDoctor,
    notifySecretaries: flags.notifySecretaries,
    sender: effectiveSenderId,
    senderRole,
    senderName: effectiveSenderName,
    type: "NEW_FINANCIAL_PLAN",
    category: "financial",
    title: "خطة مالية جديدة",
    message: `تم إنشاء خطة مالية جديدة للمريض ${patient.name}.`,
    link: `/financial-plans/${plan._id}`,
    linkType: "dashboard",
    patientId: patient._id,
    doctorId: doctor._id,
  });
};

export const notifyStaffPaymentRecorded = async (
  clinicSlug,
  patient,
  amount,
  planId,
  senderRole = "patient",
  senderId,
  senderName,
) => {
  const doctor = await Doctor.findById(
    patient.doctorId || patient.assignedDoctorId,
  );
  if (!doctor) {
    logger.warn("[notifyStaffPaymentRecorded] Doctor not found for patient", {
      patientId: patient._id,
    });
    return;
  }
  const doctorId = doctor._id;
  const flags = getStaffNotificationFlags(senderRole);
  const effectiveSenderId = senderId || patient._id;
  const effectiveSenderName = senderName || patient.name;

  await notifyClinicStaff({
    clinicSlug: clinicSlug || doctor.clinicSlug,
    doctorId,
    notifyDoctor: flags.notifyDoctor,
    notifySecretaries: flags.notifySecretaries,
    sender: effectiveSenderId,
    senderRole,
    senderName: effectiveSenderName,
    type: "PAYMENT_RECORDED",
    category: "payment",
    title: "تم تسجيل دفعة",
    message: `${effectiveSenderName} سجل دفعة بقيمة ${amount} ج.م. للمريض ${patient.name}.`,
    link: `/financials/${planId}`,
    linkType: "dashboard",
    patientId: patient._id,
    doctorId,
  });
};

export const notifyPatientPaymentRecorded = async (
  patientId,
  amount,
  planId,
  doctorName,
) => {
  await createInAppNotification({
    recipient: patientId,
    recipientRole: "patient",
    senderRole: "doctor",
    senderName: doctorName,
    type: "PAYMENT_RECORDED",
    category: "payment",
    title: "تم تسجيل دفعة",
    message: `تم تسجيل دفعة بقيمة ${amount} ج.م. في خطتك المالية.`,
    link: `/patient/financials/${planId}`,
    linkType: "dashboard",
    patientId: patientId,
  });
};

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
      type: "APPOINTMENT_CONFIRMED",
    },
    rejected: {
      title: "تم رفض الموعد",
      message: `تم رفض موعدك مع د. ${doctorName}. يرجى حجز موعد آخر.`,
      type: "APPOINTMENT_REJECTED",
    },
    cancelled: {
      title: "تم إلغاء الموعد",
      message: `تم إلغاء موعدك مع د. ${doctorName}. يرجى التواصل مع العيادة.`,
      type: "APPOINTMENT_CANCELLED",
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

    await notifyClinicStaff({
      clinicSlug: resolvedClinicSlug,
      doctorId: doctor._id,
      notifyDoctor: true,
      notifySecretaries: true,
      sender: patient._id,
      senderRole: "patient",
      senderName: patient.name,
      type: "NEW_PATIENT_REGISTERED",
      category: "patient",
      title: "مريض جديد",
      message: `مريض جديد: قام ${patient.name} بإنشاء حساب جديد. الهاتف: ${patient.phoneNumber || "لا يوجد رقم"}`,
      link: `/patients/${patient._id}`,
      linkType: "patient",
      patientId: patient._id,
      doctorId: doctor._id,
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

export const notifyPatientFinancialPlan = async (
  patientId,
  plan,
  doctorName,
  clinicSlug,
) => {
  await createInAppNotification({
    recipient: patientId,
    recipientRole: "patient",
    recipientClinicSlug: clinicSlug,
    sender: plan.doctorId,
    senderRole: "doctor",
    senderName: doctorName,
    type: "NEW_FINANCIAL_PLAN",
    category: "financial",
    title: "خطة مالية جديدة",
    message: `قام د. ${doctorName} بإضافة خطة مالية جديدة لك. يرجى مراجعة التفاصيل.`,
    link: `/financial-plans/${plan._id}`,
    linkType: "dashboard",
    patientId,
    doctorId: plan.doctorId,
  });
};

/**
 * Notify clinic staff (doctor + secretaries) about a new payment
 * @param {String} clinicSlug - The clinic identifier
 * @param {Object} patient - Patient data
 * @param {Number} amount - Amount paid
 * @param {String} planId - The ID of the financial plan
 */
export const notifyStaffNewPayment = async (
  clinicSlug,
  patient,
  amount,
  planId,
) => {
  try {
    const doctor = await Doctor.findById(
      patient.doctorId || patient.assignedDoctorId,
    );

    if (!doctor || !doctor.clinicSlug) {
      logger.warn("[notifyStaffNewPayment] Doctor or clinicSlug not found");
      return;
    }

    const resolvedClinicSlug = clinicSlug || doctor.clinicSlug;

    // 1. Create the notification object
    const notificationData = {
      recipient: resolvedClinicSlug, // Temporary for clinic-wide, updated below
      recipientRole: "clinic_staff",
      recipientClinicSlug: resolvedClinicSlug,
      sender: patient._id,
      senderRole: "patient",
      senderName: patient.name,
      type: "NEW_PAYMENT_MADE", // <--- اسم الإشعار الجديد
      category: "payment", // <--- تصنيف الإشعار الجديد
      title: "دفعة مالية جديدة",
      message: `قام المريض ${patient.name} بدفع مبلغ ${amount} ج.م.`,
      link: `/financials/${planId}`, // اللينك اللي هيروحله لما يدوس
      linkType: "dashboard",
      patientId: patient._id,
      doctorId: doctor._id,
    };

    // 2. Save it to Database for the primary doctor
    const savedNotification = await InAppNotification.create({
      ...notificationData,
      recipient: doctor._id,
      recipientRole: "doctor",
    });

    // 3. Emit real-time notification to the entire clinic staff via Socket.io
    emitNotificationToStaff(resolvedClinicSlug, {
      id: savedNotification._id,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      timestamp: new Date().toISOString(),
      link: notificationData.link,
    });

    logger.debug("[notifyStaffNewPayment] Notification sent to staff");
  } catch (error) {
    logger.error("[notifyStaffNewPayment] Failed:", error.message);
  }
};
