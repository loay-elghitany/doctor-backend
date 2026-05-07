import { jest } from "@jest/globals";
import ScannedPrescription from "../../src/models/ScannedPrescription.js";
import InAppNotification from "../../src/models/InAppNotification.js";
import { authHeader, request, setupAuthFixtures } from "../testUtils.js";
import cloudinaryService from "../../src/services/cloudinaryService.js";
import { whatsappService } from "../../src/services/whatsappNotificationService.js";

describe("Scanned Prescription Upload", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  test("Secretary can upload scanned prescription for patient in their clinic", async () => {
    // Mock Cloudinary service
    const uploadSpy = jest
      .spyOn(cloudinaryService, "uploadBuffer")
      .mockResolvedValue("https://cloudinary.com/fake-url.pdf");

    // Mock WhatsApp service
    const whatsappSpy = jest
      .spyOn(whatsappService, "sendMessage")
      .mockResolvedValue(true);

    // Create a mock file buffer
    const mockFileBuffer = Buffer.from("fake pdf content");

    const response = await request
      .post("/api/secretaries/prescriptions/upload")
      .set("Authorization", authHeader(fixtures.secretaryAToken))
      .field("patientId", fixtures.patientA1._id.toString())
      .field("doctorId", fixtures.doctorA._id.toString())
      .field("notes", "Test prescription notes")
      .attach("file", mockFileBuffer, {
        filename: "test-prescription.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.patientId).toBe(
      fixtures.patientA1._id.toString(),
    );
    expect(response.body.data.fileUrl).toBe(
      "https://cloudinary.com/fake-url.pdf",
    );
    expect(response.body.data.fileType).toBe("pdf");
    expect(response.body.data.notes).toBe("Test prescription notes");

    // Verify document was saved to database
    const savedDoc = await ScannedPrescription.findById(response.body.data._id);
    expect(savedDoc).toBeTruthy();
    expect(savedDoc.patientId.toString()).toBe(
      fixtures.patientA1._id.toString(),
    );
    expect(savedDoc.uploadedBy.toString()).toBe(
      fixtures.secretaryA._id.toString(),
    );
    expect(savedDoc.fileUrl).toBe("https://cloudinary.com/fake-url.pdf");
    expect(savedDoc.fileType).toBe("pdf");
    expect(savedDoc.clinicSlug).toBe(fixtures.doctorA.clinicSlug);

    // Verify in-app notification was created with correct type
    const notifications = await InAppNotification.find({
      recipient: fixtures.patientA1._id,
      type: "SCANNED_PRESCRIPTION_UPLOADED",
    });
    expect(notifications.length).toBeGreaterThan(0);
    const notification = notifications[0];
    expect(notification.type).toBe("SCANNED_PRESCRIPTION_UPLOADED");
    expect(notification.title).toBe("تم رفع روشتة جديدة");
    expect(notification.message).toBe(
      "تم رفع روشتة جديدة في ملفك الطبي. يمكنك عرضها أو طباعتها من حسابك",
    );
    expect(notification.recipientRole).toBe("patient");
    expect(notification.senderRole).toBe("secretary");

    // Restore mocks
    uploadSpy.mockRestore();
    whatsappSpy.mockRestore();
  });

  test("Patient can retrieve their scanned prescriptions", async () => {
    const doc = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl: "https://cloudinary.com/test.pdf",
      fileType: "pdf",
      notes: "Prescription copy",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    const response = await request
      .get(`/api/patients/${fixtures.patientA1._id}/scanned-prescriptions`)
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0]._id).toBe(doc._id.toString());
  });

  test("Doctor can retrieve clinic scanned prescriptions", async () => {
    await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl: "https://cloudinary.com/test2.pdf",
      fileType: "pdf",
      notes: "Doctor view",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    const response = await request
      .get("/api/doctors/scanned-prescriptions?limit=3")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  test("Upload fails without file", async () => {
    const response = await request
      .post("/api/secretaries/prescriptions/upload")
      .set("Authorization", authHeader(fixtures.secretaryAToken))
      .field("patientId", fixtures.patientA1._id.toString());

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("File is required");
  });

  test("Upload fails with invalid file type", async () => {
    const mockFileBuffer = Buffer.from("fake content");
    const mockFile = {
      buffer: mockFileBuffer,
      mimetype: "text/plain",
      size: 1024,
    };

    const response = await request
      .post("/api/secretaries/prescriptions/upload")
      .set("Authorization", authHeader(fixtures.secretaryAToken))
      .field("patientId", fixtures.patientA1._id.toString())
      .attach("file", mockFile.buffer, {
        filename: "test.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Only JPG, PNG, and PDF files are allowed",
    );
  });

  test("Upload fails with file too large", async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
    const response = await request
      .post("/api/secretaries/prescriptions/upload")
      .set("Authorization", authHeader(fixtures.secretaryAToken))
      .field("patientId", fixtures.patientA1._id.toString())
      .attach("file", largeBuffer, {
        filename: "large.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("File size must be 5MB or less");
  });

  test("Upload fails for patient not in secretary's clinic", async () => {
    const mockFileBuffer = Buffer.from("fake pdf content");
    const response = await request
      .post("/api/secretaries/prescriptions/upload")
      .set("Authorization", authHeader(fixtures.secretaryAToken))
      .field("patientId", fixtures.patientB1._id.toString()) // Wrong clinic
      .attach("file", mockFileBuffer, {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Patient not found or access denied");
  });

  test("Upload fails without authentication", async () => {
    const mockFileBuffer = Buffer.from("fake pdf content");
    const response = await request
      .post("/api/secretaries/prescriptions/upload")
      .field("patientId", fixtures.patientA1._id.toString())
      .attach("file", mockFileBuffer, {
        filename: "test.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(401);
  });
});
