import Notification from "../models/Notification.js";
import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";

import auditService from "./auditService.js";
import logger from "../utils/logger.js";

/**
 * WhatsApp Notification Service
 * Handles sending WhatsApp messages via configured provider (Twilio or WhatsApp Cloud API)
 * Supports async/non-blocking operations with automatic retry logic
 */

class WhatsAppNotificationService {
  constructor() {
    // Map environment provider values to internal provider keys.
    // Accepts 'twilio' or 'cloud' (case-insensitive). Defaults to TEST when missing.
    const rawProvider = process.env.WHATSAPP_PROVIDER;
    const provNorm = rawProvider
      ? String(rawProvider).trim().toLowerCase()
      : "";
    if (!provNorm) {
      this.provider = "TEST"; // not configured, safe default
    } else if (provNorm === "twilio") {
      this.provider = "TWILIO";
    } else if (provNorm === "cloud") {
      this.provider = "WHATSAPP_CLOUD";
    } else {
      // preserve older explicit values if provided
      this.provider = String(rawProvider).toUpperCase();
    }
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromPhoneNumber = process.env.TWILIO_FROM_PHONE;
    this.whatsappCloudApiToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
    this.whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.whatsappBusinessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    this.isEnabled =
      String(process.env.WHATSAPP_NOTIFICATIONS_ENABLED)
        .trim()
        .toLowerCase() === "true";
    // isConfigured indicates whether provider + credentials are valid
    this.isConfigured = false;

    // Log selected provider at startup
    logger.debug("WhatsAppNotificationService", "Provider selected", {
      provider: this.provider,
      enabled: this.isEnabled,
    });

    if (this.isEnabled) {
      this.isConfigured = this.validateConfiguration();
    }
  }

  // Validate configuration for selected provider. Returns boolean and sets isConfigured.
  validateConfiguration() {
    try {
      if (this.provider === "TWILIO") {
        if (!this.accountSid || !this.authToken || !this.fromPhoneNumber) {
          logger.warn(
            "WhatsAppNotificationService",
            "Twilio not configured, skipping notifications",
            {
              missing: [
                !this.accountSid && "TWILIO_ACCOUNT_SID",
                !this.authToken && "TWILIO_AUTH_TOKEN",
                !this.fromPhoneNumber && "TWILIO_FROM_PHONE",
              ].filter(Boolean),
            },
          );
          return false;
        }
      } else if (this.provider === "WHATSAPP_CLOUD") {
        if (!this.whatsappCloudApiToken || !this.whatsappPhoneNumberId) {
          logger.warn(
            "WhatsAppNotificationService",
            "WhatsApp Cloud not configured, skipping notifications",
            {
              missing: [
                !this.whatsappCloudApiToken && "WHATSAPP_CLOUD_API_TOKEN",
                !this.whatsappPhoneNumberId && "WHATSAPP_PHONE_NUMBER_ID",
              ].filter(Boolean),
            },
          );
          return false;
        }
      }

      return true;
    } catch (err) {
      logger.error(
        "WhatsAppNotificationService",
        "Configuration validation error",
        err,
      );
      return false;
    }
  }

  /**
   * Send WhatsApp message via configured provider
   * Non-blocking: logs errors but doesn't throw
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isEnabled) {
      logger.debug("WhatsAppNotificationService", "Notifications disabled", {
        phoneNumber,
      });
      return { success: false, reason: "Notifications disabled" };
    }
    if (!this.isConfigured) {
      logger.warn(
        "WhatsAppNotificationService",
        "Provider not configured, skipping notification",
        {
          provider: this.provider,
        },
      );
      return { success: false, reason: "WhatsApp provider not configured" };
    }
    try {
      logger.debug("WhatsAppNotificationService", "Sending message", {
        provider: this.provider,
        phoneNumber: this.maskPhoneNumber(phoneNumber),
      });

      if (this.provider === "TWILIO") {
        return await this.sendViaTwilio(phoneNumber, message);
      } else if (this.provider === "WHATSAPP_CLOUD") {
        return await this.sendViaWhatsAppCloud(phoneNumber, message);
      }

      return { success: false, reason: "Unknown provider" };
    } catch (error) {
      logger.error(
        "WhatsAppNotificationService",
        "Failed to send message",
        error,
      );
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send via Twilio
   */
  async sendViaTwilio(phoneNumber, message) {
    try {
      const twilioModule = await import("twilio");
      const twilio = twilioModule.default || twilioModule;
      const client = twilio(this.accountSid, this.authToken);

      // Ensure phone number is in international format
      const intlPhone = this.normalizePhoneNumber(phoneNumber);

      const result = await client.messages.create({
        from: `whatsapp:${this.fromPhoneNumber}`,
        to: `whatsapp:${intlPhone}`,
        body: message,
      });

      return {
        success: true,
        messageId: result.sid,
        provider: "TWILIO",
      };
    } catch (error) {
      logger.error("WhatsAppNotificationService", "Twilio send failed", error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send via WhatsApp Cloud API (Meta)
   */
  async sendViaWhatsAppCloud(phoneNumber, message) {
    try {
      const fetch = (await import("node-fetch")).default;

      const intlPhone = this.normalizePhoneNumber(phoneNumber);
      const url = `https://graph.instagram.com/v18.0/${this.whatsappPhoneNumberId}/messages`;

      const payload = {
        messaging_product: "whatsapp",
        to: intlPhone,
        type: "text",
        text: {
          preview_url: true,
          body: message,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.whatsappCloudApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `WhatsApp Cloud API error: ${error.error?.message || response.statusText}`,
        );
      }

      const result = await response.json();
      return {
        success: true,
        messageId: result.messages[0].id,
        provider: "WHATSAPP_CLOUD",
      };
    } catch (error) {
      logger.error(
        "WhatsAppNotificationService",
        "WhatsApp Cloud API send failed",
        error,
      );
      return { success: false, reason: error.message };
    }
  }

  /**
   * Normalize phone number to international format
   */
  normalizePhoneNumber(phone) {
    // Remove common separators
    let cleaned = phone.replace(/[-.\s()]/g, "");

    // Add country code if missing (assume +1 for testing/US)
    if (!cleaned.startsWith("+")) {
      if (cleaned.length === 10) {
        cleaned = "+2" + cleaned; // Assume US number
      } else if (!cleaned.startsWith("2") && cleaned.length === 11) {
        cleaned = "+" + cleaned;
      } else if (!cleaned.includes("+")) {
        cleaned = "+" + cleaned;
      }
    }

    return cleaned;
  }

  /**
   * Mask phone number for logging (e.g., +1234****678)
   */
  maskPhoneNumber(phone) {
    const cleaned = phone.replace(/[-.\s()]/g, "");
    const start = cleaned.substring(0, 4);
    const end = cleaned.substring(cleaned.length - 3);
    return `${start}${"*".repeat(cleaned.length - 7)}${end}`;
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppNotificationService();

/**
 * Create and send a notification
 * Automatically retrieves recipient phone number and sends message
 * Non-blocking: stores notification record and logs failures
 */
export const createAndSendNotification = async (options) => {
  const {
    recipientId,
    recipientType,
    type, // appointment_created, prescription_created, etc.
    title,
    message,
    appointmentId,
    prescriptionId,
    doctorId,
    patientId,
    actionUrl,
    metadata = {},
  } = options;

  try {
    logger.debug("createAndSendNotification", "Creating notification", {
      recipientId,
      recipientType,
      type,
    });

    // Get recipient phone number
    let phoneNumber;
    let recipient;

    if (recipientType === "Patient") {
      recipient = await Patient.findById(recipientId);
      phoneNumber = recipient?.phoneNumber;
    } else if (recipientType === "Doctor") {
      recipient = await Doctor.findById(recipientId);
      phoneNumber = recipient?.phoneNumber;
    } else {
      throw new Error(`Invalid recipient type: ${recipientType}`);
    }

    if (!phoneNumber) {
      logger.debug("createAndSendNotification", "No phone number found", {
        recipientId,
        recipientType,
      });

      // Create a failed notification record so the event is auditable
      const failedNotification = await Notification.create({
        recipientId,
        recipientType,
        phoneNumber: null,
        type,
        title,
        message,
        appointmentId,
        prescriptionId,
        doctorId,
        patientId,
        actionUrl,
        metadata,
        status: "failed",
        failureReason: "No phone number on file",
      });

      logger.debug("createAndSendNotification", "Created failed notification", {
        notificationId: failedNotification._id,
        recipientId,
      });

      return { success: true, notificationId: failedNotification._id };
    }

    // If recipient is a doctor and their subscription is inactive, suppress sending
    if (
      recipientType === "Doctor" &&
      recipient &&
      recipient.isActive === false
    ) {
      logger.debug(
        "createAndSendNotification",
        "Doctor subscription inactive - suppressing notification",
        {
          recipientId,
        },
      );

      // Create a suppressed notification record for auditing
      const suppressedNotification = await Notification.create({
        recipientId,
        recipientType,
        phoneNumber,
        type,
        title,
        message,
        appointmentId,
        prescriptionId,
        doctorId,
        patientId,
        actionUrl,
        metadata,
        status: "suppressed",
        failureReason:
          "Recipient subscription inactive - notification suppressed",
      });

      // Log audit
      try {
        await auditService.logBlockedAction({
          actorType: "System",
          actorId: null,
          action: "notification_suppressed_inactive_recipient",
          resourceType: "Notification",
          resourceId: suppressedNotification._id,
          reason: "recipient_inactive",
          meta: { recipientId, recipientType, type },
        });
      } catch (e) {
        logger.error(
          "createAndSendNotification",
          "Audit logging failed for suppressed notification",
          e,
        );
      }

      return { success: true, notificationId: suppressedNotification._id };
    }

    // Create notification record
    const notification = await Notification.create({
      recipientId,
      recipientType,
      phoneNumber,
      type,
      title,
      message,
      appointmentId,
      prescriptionId,
      doctorId,
      patientId,
      actionUrl,
      metadata,
      status: "pending",
    });

    // Send message asynchronously (non-blocking)
    sendNotificationAsync(notification);

    logger.debug("createAndSendNotification", "Notification created", {
      notificationId: notification._id,
      recipientId,
    });

    return { success: true, notificationId: notification._id };
  } catch (error) {
    logger.error(
      "createAndSendNotification",
      "Failed to create notification",
      error,
    );
    return { success: false, reason: error.message };
  }
};

/**
 * Send notification asynchronously (non-blocking)
 * Fires in background, logs errors but doesn't interrupt main flow
 */
async function sendNotificationAsync(notification) {
  try {
    logger.debug("sendNotificationAsync", "Sending", {
      notificationId: notification._id,
    });

    const result = await whatsappService.sendMessage(
      notification.phoneNumber,
      notification.message,
    );

    if (result.success) {
      notification.status = "sent";
      notification.sentAt = new Date();
      notification.whatsappMessageId = result.messageId;
      await notification.save();
      logger.debug("sendNotificationAsync", "Sent successfully", {
        notificationId: notification._id,
      });
    } else {
      notification.status = "failed";
      notification.failureReason = result.reason;
      notification.retryCount += 1;
      await notification.save();
      logger.debug("sendNotificationAsync", "Send failed", {
        notificationId: notification._id,
        reason: result.reason,
      });
    }
  } catch (error) {
    logger.error("sendNotificationAsync", "Error sending notification", error);
    if (notification && !notification.isDeleted) {
      notification.status = "failed";
      notification.failureReason = error.message;
      notification.retryCount += 1;
      await notification.save().catch((saveError) => {
        logger.error(
          "sendNotificationAsync",
          "Failed to save notification error",
          saveError,
        );
      });
    }
  }
}

/**
 * Retry failed notifications
 * Runs periodically (e.g., every 5 minutes) to retry failed messages
 */
export const retryFailedNotifications = async () => {
  try {
    logger.debug("retryFailedNotifications", "Starting retry job");

    const failedNotifications = await Notification.find({
      status: "failed",
      retryCount: { $lt: 3 },
      isDeleted: { $ne: true },
    }).limit(10);

    logger.debug("retryFailedNotifications", "Found failed notifications", {
      count: failedNotifications.length,
    });

    for (const notification of failedNotifications) {
      sendNotificationAsync(notification);
    }
  } catch (error) {
    logger.error(
      "retryFailedNotifications",
      "Error retrying notifications",
      error,
    );
  }
};

/**
 * Get notification status
 */
export const getNotificationStatus = async (notificationId) => {
  try {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return { success: false, reason: "Notification not found" };
    }

    return {
      success: true,
      status: notification.status,
      sentAt: notification.sentAt,
      failureReason: notification.failureReason,
      retryCount: notification.retryCount,
    };
  } catch (error) {
    logger.error(
      "getNotificationStatus",
      "Error getting notification status",
      error,
    );
    return { success: false, reason: error.message };
  }
};
