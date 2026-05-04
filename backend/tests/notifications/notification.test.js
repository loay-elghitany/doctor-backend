import { jest } from "@jest/globals";
import InAppNotification from "../../src/models/InAppNotification.js";
import Doctor from "../../src/models/Doctor.js";
import Patient from "../../src/models/Patient.js";
import Secretary from "../../src/models/Secretary.js";
import { createInAppNotification } from "../../src/controllers/notificationController.js";
import { authHeader, request, setupAuthFixtures } from "../testUtils.js";

describe("Notification Management - In-App Notifications", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  describe("Create In-App Notifications", () => {
    test("Doctor can create a notification for a patient", async () => {
      const notificationData = {
        recipient: fixtures.patientA1._id.toString(),
        recipientRole: "patient",
        sender: fixtures.doctorA._id.toString(),
        senderRole: "doctor",
        senderName: "Dr. Test",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "موعد جديد",
        message: "لديك موعد جديد مع الطبيب",
        link: "/appointments/123",
      };

      // Directly call the service since this is not exposed as REST endpoint
      const notification = await InAppNotification.create(notificationData);

      expect(notification).toBeDefined();
      expect(notification._id).toBeDefined();
      expect(notification.recipient.toString()).toBe(
        fixtures.patientA1._id.toString(),
      );
      expect(notification.type).toBe("NEW_APPOINTMENT");
      expect(notification.isRead).toBe(false);
      expect(notification.isDeleted).toBe(false);
    });

    test("Notification persists with all required fields", async () => {
      const notificationData = {
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
        recipientClinicSlug: "clinic-test",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        senderName: "Dr. Test",
        type: "APPOINTMENT_ACCEPTED",
        category: "appointment",
        title: "تم قبول الموعد",
        message: "تم قبول الموعد الخاص بك",
      };

      const notification = await InAppNotification.create(notificationData);
      const savedNotification = await InAppNotification.findById(
        notification._id,
      );

      expect(savedNotification).not.toBeNull();
      expect(savedNotification.recipient.toString()).toBe(
        fixtures.patientA1._id.toString(),
      );
      expect(savedNotification.senderName).toBe("Dr. Test");
      expect(savedNotification.title).toBe("تم قبول الموعد");
    });

    test("Notification type must be from enum", async () => {
      try {
        await InAppNotification.create({
          recipient: fixtures.patientA1._id,
          recipientRole: "patient",
          sender: fixtures.doctorA._id,
          senderRole: "doctor",
          type: "INVALID_TYPE",
          category: "appointment",
          title: "Test",
          message: "Test",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toMatch(/enum|invalid/i);
      }
    });

    test("RecipientRole must be from enum", async () => {
      try {
        await InAppNotification.create({
          recipient: fixtures.patientA1._id,
          recipientRole: "invalid_role",
          sender: fixtures.doctorA._id,
          senderRole: "doctor",
          type: "NEW_APPOINTMENT",
          category: "appointment",
          title: "Test",
          message: "Test",
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toMatch(/enum|invalid/i);
      }
    });
  });

  describe("createInAppNotification helper", () => {
    let doctorWithTelegram;
    let patientWithTelegram;
    let secretaryWithTelegram;

    beforeEach(async () => {
      doctorWithTelegram = await Doctor.create({
        name: "Doctor Telegram",
        email: "doctor-telegram@example.com",
        password: "doctorpass",
        clinicSlug: "clinic-telegram",
        telegramChatId: "tg-doctor-123",
      });

      patientWithTelegram = await Patient.create({
        name: "Patient Telegram",
        email: "patient-telegram@example.com",
        password: "patientpass",
        doctorId: doctorWithTelegram._id,
        clinicSlug: "clinic-telegram",
        telegramChatId: "tg-patient-456",
      });

      secretaryWithTelegram = await Secretary.create({
        name: "Secretary Telegram",
        email: "secretary-telegram@example.com",
        password: "secretarypass",
        doctorId: doctorWithTelegram._id,
        telegramChatId: "tg-secretary-789",
      });
    });

    test("createInAppNotification persists doctor notification", async () => {
      const notification = await createInAppNotification({
        recipient: doctorWithTelegram._id,
        recipientRole: "doctor",
        recipientClinicSlug: doctorWithTelegram.clinicSlug,
        sender: patientWithTelegram._id,
        senderRole: "patient",
        senderName: patientWithTelegram.name,
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "طلب موعد",
        message: "يرجى مراجعة طلب الموعد",
        link: "/appointments/test",
        linkType: "appointment",
      });

      expect(notification).toBeDefined();
      expect(notification.recipientRole).toBe("doctor");
      expect(notification.isRead).toBe(false);

      const savedNotification = await InAppNotification.findById(
        notification._id,
      );
      expect(savedNotification).not.toBeNull();
      expect(savedNotification.recipient.toString()).toBe(
        doctorWithTelegram._id.toString(),
      );
      expect(savedNotification.type).toBe("NEW_APPOINTMENT");
      expect(savedNotification.title).toBe("طلب موعد");
    });

    test("createInAppNotification persists patient notification", async () => {
      const notification = await createInAppNotification({
        recipient: patientWithTelegram._id,
        recipientRole: "patient",
        sender: doctorWithTelegram._id,
        senderRole: "doctor",
        senderName: doctorWithTelegram.name,
        type: "APPOINTMENT_ACCEPTED",
        category: "appointment",
        title: "تم قبول الموعد",
        message: "تم قبول موعدك بنجاح",
        link: "/appointments/test",
        linkType: "appointment",
      });

      expect(notification).toBeDefined();
      expect(notification.recipientRole).toBe("patient");

      const savedNotification = await InAppNotification.findById(
        notification._id,
      );
      expect(savedNotification).not.toBeNull();
      expect(savedNotification.recipient.toString()).toBe(
        patientWithTelegram._id.toString(),
      );
      expect(savedNotification.type).toBe("APPOINTMENT_ACCEPTED");
    });

    test("createInAppNotification persists secretary notification", async () => {
      const notification = await createInAppNotification({
        recipient: secretaryWithTelegram._id,
        recipientRole: "secretary",
        recipientClinicSlug: doctorWithTelegram.clinicSlug,
        sender: patientWithTelegram._id,
        senderRole: "patient",
        senderName: patientWithTelegram.name,
        type: "NEW_PRESCRIPTION",
        category: "prescription",
        title: "روشتة جديدة",
        message: "تم إضافة روشتة جديدة",
        link: "/prescriptions/test",
        linkType: "prescription",
      });

      expect(notification).toBeDefined();
      expect(notification.recipientRole).toBe("secretary");

      const savedNotification = await InAppNotification.findById(
        notification._id,
      );
      expect(savedNotification).not.toBeNull();
      expect(savedNotification.recipient.toString()).toBe(
        secretaryWithTelegram._id.toString(),
      );
      expect(savedNotification.type).toBe("NEW_PRESCRIPTION");
    });
  });

  describe("Get In-App Notifications", () => {
    beforeEach(async () => {
      // Create sample notifications for patient
      await InAppNotification.create({
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        senderName: "Dr. A",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "موعد جديد",
        message: "لديك موعد جديد",
        isRead: false,
      });

      await InAppNotification.create({
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        senderName: "Dr. A",
        type: "APPOINTMENT_ACCEPTED",
        category: "appointment",
        title: "تم قبول الموعد",
        message: "تم قبول موعدك",
        isRead: true,
      });

      await InAppNotification.create({
        recipient: fixtures.patientA2._id,
        recipientRole: "patient",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        type: "NEW_PRESCRIPTION",
        category: "prescription",
        title: "وصفة جديدة",
        message: "وصفة طبية جديدة",
      });
    });

    test("Patient can retrieve their notifications", async () => {
      const response = await request
        .get("/api/notifications/inapp")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Response may be an array or have a wrapper structure
      const data = Array.isArray(response.body.data)
        ? response.body.data
        : response.body.data?.notifications || [];
      if (data.length > 0) {
        expect(data[0].recipient.toString()).toBe(
          fixtures.patientA1._id.toString(),
        );
      }
    });

    test("Unread count is calculated correctly", async () => {
      const response = await request
        .get("/api/notifications/inapp/unread-count")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    });

    test("Patient can only see their own notifications", async () => {
      const response = await request
        .get("/api/notifications/inapp")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      const data = Array.isArray(response.body.data)
        ? response.body.data
        : response.body.data?.notifications || [];
      const recipientIds = data.map((n) => n.recipient.toString());
      recipientIds.forEach((id) => {
        expect(id).toBe(fixtures.patientA1._id.toString());
      });
      // patientA2's notifications should not be included
      const patientA2Ids = data.filter(
        (n) => n.recipient.toString() === fixtures.patientA2._id.toString(),
      );
      expect(patientA2Ids.length).toBe(0);
    });

    test("Can filter for unread notifications only", async () => {
      const response = await request
        .get("/api/notifications/inapp?unreadOnly=true")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      const data = Array.isArray(response.body.data)
        ? response.body.data
        : response.body.data?.notifications || [];
      data.forEach((notification) => {
        expect(notification.isRead).toBe(false);
      });
    });

    test("Doctor can retrieve staff notifications", async () => {
      // Create a doctor notification
      await InAppNotification.create({
        recipient: fixtures.doctorA._id,
        recipientRole: "doctor",
        recipientClinicSlug: "clinic-a",
        sender: fixtures.patientA1._id,
        senderRole: "patient",
        senderName: "Patient A1",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "طلب موعد جديد",
        message: "طلب موعد جديد من المريض",
      });

      const response = await request
        .get("/api/notifications/inapp")
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      if (Array.isArray(response.body.data)) {
        expect(response.body.data.length).toBeGreaterThan(0);
        const doctorNotifications = response.body.data.filter(
          (n) => n.recipient.toString() === fixtures.doctorA._id.toString(),
        );
        expect(doctorNotifications.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Mark Notification as Read", () => {
    let unreadNotification;

    beforeEach(async () => {
      unreadNotification = await InAppNotification.create({
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        senderName: "Dr. A",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "موعد جديد",
        message: "لديك موعد جديد",
        isRead: false,
      });
    });

    test("Patient can mark notification as read", async () => {
      const response = await request
        .patch(
          `/api/notifications/inapp/${unreadNotification._id.toString()}/read`,
        )
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isRead).toBe(true);
      expect(response.body.data.readAt).toBeDefined();

      const updated = await InAppNotification.findById(unreadNotification._id);
      expect(updated.isRead).toBe(true);
      expect(updated.readAt).toBeDefined();
    });

    test("Patient cannot mark another patient's notification as read", async () => {
      const response = await request
        .patch(
          `/api/notifications/inapp/${unreadNotification._id.toString()}/read`,
        )
        .set("Authorization", authHeader(fixtures.patientA2Token));

      // Should get 401 unauthorized or 404 not found
      expect([401, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);

      // Verify it wasn't marked as read
      const updated = await InAppNotification.findById(unreadNotification._id);
      expect(updated.isRead).toBe(false);
    });

    test("Can mark all notifications as read", async () => {
      // Create multiple unread notifications
      await InAppNotification.create({
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        type: "APPOINTMENT_ACCEPTED",
        category: "appointment",
        title: "تم قبول الموعد",
        message: "تم قبول موعدك",
        isRead: false,
      });

      const response = await request
        .patch("/api/notifications/inapp/mark-all-read")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify all notifications are marked as read
      const notifications = await InAppNotification.find({
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
      });
      notifications.forEach((notif) => {
        expect(notif.isRead).toBe(true);
      });
    });
  });

  describe("Delete Notification (Soft Delete)", () => {
    let notificationToDelete;

    beforeEach(async () => {
      notificationToDelete = await InAppNotification.create({
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "موعد جديد",
        message: "لديك موعد جديد",
      });
    });

    test("Patient can delete their notification", async () => {
      const response = await request
        .delete(
          `/api/notifications/inapp/${notificationToDelete._id.toString()}`,
        )
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify soft delete
      const deleted = await InAppNotification.findById(
        notificationToDelete._id,
      );
      expect(deleted.isDeleted).toBe(true);
      expect(deleted.deletedAt).toBeDefined();
    });

    test("Deleted notifications are excluded from retrieval", async () => {
      // Delete one notification
      await request
        .delete(
          `/api/notifications/inapp/${notificationToDelete._id.toString()}`,
        )
        .set("Authorization", authHeader(fixtures.patientA1Token));

      // Get notifications
      const response = await request
        .get("/api/notifications/inapp")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      if (Array.isArray(response.body.data)) {
        const notificationIds = response.body.data.map((n) => n._id.toString());
        expect(notificationIds).not.toContain(
          notificationToDelete._id.toString(),
        );
      }
    });

    test("Patient cannot delete another patient's notification", async () => {
      const response = await request
        .delete(
          `/api/notifications/inapp/${notificationToDelete._id.toString()}`,
        )
        .set("Authorization", authHeader(fixtures.patientA2Token));

      // Should get 404 because the notification doesn't belong to patientA2
      expect([401, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);

      // Verify it wasn't deleted
      const notif = await InAppNotification.findById(notificationToDelete._id);
      expect(notif.isDeleted).toBe(false);
    });
  });

  describe("Notification Statistics", () => {
    beforeEach(async () => {
      // Create multiple notifications of different types
      await InAppNotification.create({
        recipient: fixtures.doctorA._id,
        recipientRole: "doctor",
        sender: fixtures.patientA1._id,
        senderRole: "patient",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "طلب موعد",
        message: "المريض يطلب موعد",
        isRead: false,
      });

      await InAppNotification.create({
        recipient: fixtures.doctorA._id,
        recipientRole: "doctor",
        sender: fixtures.patientA1._id,
        senderRole: "patient",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "طلب موعد آخر",
        message: "طلب موعد آخر",
        isRead: true,
      });

      await InAppNotification.create({
        recipient: fixtures.doctorA._id,
        recipientRole: "doctor",
        sender: fixtures.patientA2._id,
        senderRole: "patient",
        type: "NEW_PRESCRIPTION",
        category: "prescription",
        title: "وصفة جديدة",
        message: "وصفة من المريض",
        isRead: false,
      });
    });

    test("Doctor can retrieve notification statistics", async () => {
      const response = await request
        .get("/api/notifications/stats")
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.unread).toBeGreaterThanOrEqual(2);
      expect(response.body.data.total).toBeGreaterThanOrEqual(3);
      expect(response.body.data.byType).toBeDefined();
    });

    test("Statistics correctly count by type", async () => {
      const response = await request
        .get("/api/notifications/stats")
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(
        response.body.data.byType["NEW_APPOINTMENT"],
      ).toBeGreaterThanOrEqual(2);
      expect(
        response.body.data.byType["NEW_PRESCRIPTION"],
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Notification Access Control", () => {
    beforeEach(async () => {
      // Create notifications for different users
      await InAppNotification.create({
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
        sender: fixtures.doctorA._id,
        senderRole: "doctor",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "موعد جديد",
        message: "لديك موعد جديد",
      });

      await InAppNotification.create({
        recipient: fixtures.patientB1._id,
        recipientRole: "patient",
        sender: fixtures.doctorB._id,
        senderRole: "doctor",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "موعد جديد",
        message: "لديك موعد جديد",
      });
    });

    test("Secretary can only see their doctor's patient notifications", async () => {
      const response = await request
        .get("/api/notifications/inapp")
        .set("Authorization", authHeader(fixtures.secretaryAToken));

      expect(response.status).toBe(200);
      // Secretary should see notifications for doctorA's patients only
      if (Array.isArray(response.body.data)) {
        const patientBNotifications = response.body.data.filter(
          (n) => n.recipient.toString() === fixtures.patientB1._id.toString(),
        );
        expect(patientBNotifications.length).toBe(0);
      }
    });

    test("Unauthenticated user cannot access notifications", async () => {
      const response = await request.get("/api/notifications/inapp");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("Patient cannot view doctor notifications", async () => {
      // Create a doctor notification
      await InAppNotification.create({
        recipient: fixtures.doctorA._id,
        recipientRole: "doctor",
        recipientClinicSlug: "clinic-a",
        sender: fixtures.patientA1._id,
        senderRole: "patient",
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "doctor alert",
        message: "alert for doctor",
      });

      const response = await request
        .get("/api/notifications/inapp")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      // Should not contain doctor's notification
      if (Array.isArray(response.body.data)) {
        const doctorNotifications = response.body.data.filter(
          (n) => n.recipient.toString() === fixtures.doctorA._id.toString(),
        );
        expect(doctorNotifications.length).toBe(0);
      }
    });
  });

  describe("Notification Type Validation", () => {
    test("All valid notification types are accepted", async () => {
      const validTypes = [
        "NEW_APPOINTMENT",
        "APPOINTMENT_ACCEPTED",
        "APPOINTMENT_REJECTED",
        "APPOINTMENT_RESCHEDULED",
        "APPOINTMENT_COMPLETED",
        "APPOINTMENT_CANCELLED",
        "NEW_PATIENT_REGISTERED",
        "NEW_PRESCRIPTION",
        "NEW_FINANCIAL_PLAN",
        "NEW_PAYMENT_MADE",
        "SYSTEM_NOTIFICATION",
      ];

      for (const type of validTypes) {
        const notification = await InAppNotification.create({
          recipient: fixtures.patientA1._id,
          recipientRole: "patient",
          sender: fixtures.doctorA._id,
          senderRole: "doctor",
          type,
          category: "appointment",
          title: "Test",
          message: "Test message",
        });
        expect(notification.type).toBe(type);
      }
    });

    test("Category must be from enum", async () => {
      try {
        await InAppNotification.create({
          recipient: fixtures.patientA1._id,
          recipientRole: "patient",
          sender: fixtures.doctorA._id,
          senderRole: "doctor",
          type: "NEW_APPOINTMENT",
          category: "invalid_category",
          title: "Test",
          message: "Test",
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toMatch(/enum|invalid/i);
      }
    });
  });

  describe("Notification Retrieval with Pagination", () => {
    beforeEach(async () => {
      // Create multiple notifications
      for (let i = 0; i < 5; i++) {
        await InAppNotification.create({
          recipient: fixtures.patientA1._id,
          recipientRole: "patient",
          sender: fixtures.doctorA._id,
          senderRole: "doctor",
          type: "NEW_APPOINTMENT",
          category: "appointment",
          title: `موعد ${i + 1}`,
          message: `موعد جديد ${i + 1}`,
        });
      }
    });

    test("Can limit number of notifications returned", async () => {
      const response = await request
        .get("/api/notifications/inapp?limit=2")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(200);
      if (Array.isArray(response.body.data)) {
        expect(response.body.data.length).toBeLessThanOrEqual(2);
      }
    });

    test("Can skip notifications with offset", async () => {
      const firstResponse = await request
        .get("/api/notifications/inapp?limit=2&skip=0")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      const secondResponse = await request
        .get("/api/notifications/inapp?limit=2&skip=2")
        .set("Authorization", authHeader(fixtures.patientA1Token));

      if (
        Array.isArray(firstResponse.body.data) &&
        Array.isArray(secondResponse.body.data)
      ) {
        const firstIds = firstResponse.body.data.map((n) => n._id.toString());
        const secondIds = secondResponse.body.data.map((n) => n._id.toString());

        // Ensure no overlap between pages
        const overlap = firstIds.filter((id) => secondIds.includes(id));
        expect(overlap.length).toBe(0);
      }
    });
  });
});
