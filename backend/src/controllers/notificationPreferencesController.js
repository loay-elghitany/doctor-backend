import NotificationPreferences from "../models/NotificationPreferences.js";
import logger from "../utils/logger.js";



/**
 * Notification Preferences Controller
 * Manages user preferences for WhatsApp, SMS, and Email notifications
 * Supports opt-in/out per notification type
 */

/**
 * Get user's notification preferences
 */
export const getNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user?._id || req.doctor?._id;
    const userType = req.user ? "Patient" : req.doctor ? "Doctor" : null;

    if (!userId || !userType) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    logger.debug("getNotificationPreferences", "Fetching preferences", {
      userId,
      userType,
    });

    // Get or create default preferences
    let preferences = await NotificationPreferences.findOne({
      userId,
      userType,
      isDeleted: { $ne: true },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await NotificationPreferences.create({
        userId,
        userType,
      });

      logger.debug("getNotificationPreferences", "Created default preferences", {
        userId,
      });
    }

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    logger.error(
      "getNotificationPreferences",
      "Error fetching preferences",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch preferences",
      data: null,
    });
  }
};

/**
 * Update notification preferences
 * Supports partial updates
 */
export const updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user?._id || req.doctor?._id;
    const userType = req.user ? "Patient" : req.doctor ? "Doctor" : null;

    if (!userId || !userType) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const {
      whatsappEnabled,
      whatsappTypes,
      whatsappQuietHours,
      smsEnabled,
      smsPhoneNumber,
      smsTypes,
      emailEnabled,
      emailTypes,
      muteAll,
    } = req.body;

    logger.debug("updateNotificationPreferences", "Updating preferences", {
      userId,
      userType,
    });

    // Find or create preferences
    let preferences = await NotificationPreferences.findOne({
      userId,
      userType,
      isDeleted: { $ne: true },
    });

    if (!preferences) {
      preferences = await NotificationPreferences.create({
        userId,
        userType,
      });
    }

    // Update fields
    if (whatsappEnabled !== undefined) {
      preferences.whatsapp.enabled = whatsappEnabled;
    }

    if (whatsappTypes) {
      preferences.whatsapp.types = {
        ...preferences.whatsapp.types,
        ...whatsappTypes,
      };
    }

    if (whatsappQuietHours) {
      if (whatsappQuietHours.enabled !== undefined) {
        preferences.whatsapp.quietHoursEnabled = whatsappQuietHours.enabled;
      }
      if (whatsappQuietHours.start) {
        preferences.whatsapp.quietHoursStart = whatsappQuietHours.start;
      }
      if (whatsappQuietHours.end) {
        preferences.whatsapp.quietHoursEnd = whatsappQuietHours.end;
      }
    }

    if (smsEnabled !== undefined) {
      preferences.sms.enabled = smsEnabled;
    }

    if (smsPhoneNumber) {
      preferences.sms.phoneNumber = smsPhoneNumber;
    }

    if (smsTypes) {
      preferences.sms.types = {
        ...preferences.sms.types,
        ...smsTypes,
      };
    }

    if (emailEnabled !== undefined) {
      preferences.email.enabled = emailEnabled;
    }

    if (emailTypes) {
      preferences.email.types = {
        ...preferences.email.types,
        ...emailTypes,
      };
    }

    if (muteAll !== undefined) {
      preferences.muteAll = muteAll;
    }

    preferences.lastUpdated = new Date();
    preferences.updatedBy = req.user?.email || req.doctor?.email || "system";

    await preferences.save();

    logger.debug("updateNotificationPreferences", "Preferences updated", {
      userId,
    });

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    logger.error(
      "updateNotificationPreferences",
      "Error updating preferences",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to update preferences",
      data: null,
    });
  }
};

/**
 * Quick toggle for a specific notification type
 * Example: toggle appointment_created to off
 */
export const toggleNotificationType = async (req, res) => {
  try {
    const userId = req.user?._id || req.doctor?._id;
    const userType = req.user ? "Patient" : req.doctor ? "Doctor" : null;

    if (!userId || !userType) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const { channel, notificationType } = req.body;

    if (!["whatsapp", "sms", "email"].includes(channel)) {
      return res.status(400).json({
        success: false,
        message: "Invalid channel",
        data: null,
      });
    }

    logger.debug("toggleNotificationType", "Toggling notification type", {
      userId,
      channel,
      notificationType,
    });

    let preferences = await NotificationPreferences.findOne({
      userId,
      userType,
      isDeleted: { $ne: true },
    });

    if (!preferences) {
      preferences = await NotificationPreferences.create({
        userId,
        userType,
      });
    }

    if (preferences[channel]?.types?.[notificationType] !== undefined) {
      preferences[channel].types[notificationType] =
        !preferences[channel].types[notificationType];

      await preferences.save();

      res.json({
        success: true,
        data: {
          channel,
          notificationType,
          enabled: preferences[channel].types[notificationType],
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid notification type",
        data: null,
      });
    }
  } catch (error) {
    logger.error("toggleNotificationType", "Error toggling notification", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle notification",
      data: null,
    });
  }
};

/**
 * Check if a notification type is enabled for a user
 * Used internally by notification service before sending
 */
export const isNotificationEnabled = async (
  userId,
  userType,
  channel,
  notificationType,
) => {
  try {
    const preferences = await NotificationPreferences.findOne({
      userId,
      userType,
      isDeleted: { $ne: true },
    });

    if (!preferences) {
      // Default: everything enabled if no preferences
      return true;
    }

    // Check mute all
    if (preferences.muteAll) {
      return false;
    }

    // Check GDPR opt-out
    if (preferences.gdprOptOut) {
      return false;
    }

    // Check channel enabled
    if (channel === "whatsapp") {
      if (!preferences.whatsapp.enabled) return false;

      // Check if type is enabled
      if (preferences.whatsapp.types[notificationType] === false) {
        return false;
      }

      // Check quiet hours
      if (preferences.whatsapp.quietHoursEnabled) {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        const start = preferences.whatsapp.quietHoursStart;
        const end = preferences.whatsapp.quietHoursEnd;

        // Simple comparison (assumes no midnight wrap)
        if (start <= end) {
          if (currentTime >= start && currentTime < end) {
            return false;
          }
        }
      }

      return true;
    }

    if (channel === "sms") {
      if (!preferences.sms.enabled) return false;
      if (preferences.sms.types[notificationType] === false) return false;
      return true;
    }

    if (channel === "email") {
      if (!preferences.email.enabled) return false;
      if (preferences.email.types[notificationType] === false) return false;
      return true;
    }

    return true;
  } catch (error) {
    logger.error(
      "isNotificationEnabled",
      "Error checking notification preference",
      error,
    );
    return true; // Fail open: send notification if check fails
  }
};

/**
 * Bulk update preferences for admin (e.g., disable all notifications for a user)
 */
export const adminUpdatePreferences = async (req, res) => {
  try {
    // Only admin can access this
    const { userId, userType, gdprOptOut, muteAll } = req.body;

    if (!userId || !userType) {
      return res.status(400).json({
        success: false,
        message: "userId and userType required",
        data: null,
      });
    }

    logger.debug("adminUpdatePreferences", "Admin updating preferences", {
      userId,
      userType,
      gdprOptOut,
      muteAll,
    });

    let preferences = await NotificationPreferences.findOne({
      userId,
      userType,
      isDeleted: { $ne: true },
    });

    if (!preferences) {
      preferences = await NotificationPreferences.create({
        userId,
        userType,
      });
    }

    if (gdprOptOut !== undefined) {
      preferences.gdprOptOut = gdprOptOut;
    }

    if (muteAll !== undefined) {
      preferences.muteAll = muteAll;
    }

    preferences.lastUpdated = new Date();
    preferences.updatedBy = "admin";

    await preferences.save();

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    logger.error(
      "adminUpdatePreferences",
      "Error updating admin preferences",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to update preferences",
      data: null,
    });
  }
};
