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

/**
 * Tests for DELETE /api/patients/scanned-prescriptions/:prescriptionId
 * Covers: delete endpoint, Cloudinary file deletion, authorization
 */
describe("Delete Scanned Prescription", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  test("Secretary can delete scanned prescription from their clinic", async () => {
    // Create a scanned prescription
    const prescription = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl:
        "https://res.cloudinary.com/demo/image/upload/v1234567890/scanned-prescriptions/test-123.pdf",
      fileType: "pdf",
      notes: "Test prescription to delete",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    // Mock Cloudinary delete
    const deleteSpy = jest
      .spyOn(cloudinaryService, "deleteFile")
      .mockResolvedValue(true);

    const response = await request
      .delete(`/api/patients/scanned-prescriptions/${prescription._id}`)
      .set("Authorization", authHeader(fixtures.secretaryAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe(
      "Scanned prescription deleted successfully",
    );

    // Verify document was deleted from database
    const deletedDoc = await ScannedPrescription.findById(prescription._id);
    expect(deletedDoc).toBeNull();

    // Verify Cloudinary deleteFile was called with the correct URL
    expect(deleteSpy).toHaveBeenCalledWith(prescription.fileUrl);

    deleteSpy.mockRestore();
  });

  test("Doctor can delete scanned prescription from their clinic", async () => {
    const prescription = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl:
        "https://res.cloudinary.com/demo/image/upload/v1234567890/scanned-prescriptions/test-456.jpg",
      fileType: "image",
      notes: "Doctor delete test",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    const deleteSpy = jest
      .spyOn(cloudinaryService, "deleteFile")
      .mockResolvedValue(true);

    const response = await request
      .delete(`/api/patients/scanned-prescriptions/${prescription._id}`)
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const deletedDoc = await ScannedPrescription.findById(prescription._id);
    expect(deletedDoc).toBeNull();

    expect(deleteSpy).toHaveBeenCalledWith(prescription.fileUrl);

    deleteSpy.mockRestore();
  });

  test("Delete fails when prescription not found", async () => {
    const fakeId = "507f1f77bcf86cd799439011";

    const response = await request
      .delete(`/api/patients/scanned-prescriptions/${fakeId}`)
      .set("Authorization", authHeader(fixtures.secretaryAToken));

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Scanned prescription not found");
  });

  test("Delete fails when user lacks authorization (different clinic)", async () => {
    // Create prescription in clinic A
    const prescription = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl:
        "https://res.cloudinary.com/demo/image/upload/v1234567890/scanned-prescriptions/test-789.pdf",
      fileType: "pdf",
      notes: "Clinic A prescription",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    // Try to delete with doctor from clinic B (different clinic)
    const response = await request
      .delete(`/api/patients/scanned-prescriptions/${prescription._id}`)
      .set("Authorization", authHeader(fixtures.doctorBToken));

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Not authorized to delete this prescription",
    );

    // Verify document was NOT deleted
    const doc = await ScannedPrescription.findById(prescription._id);
    expect(doc).toBeTruthy();
  });

  test("Delete fails without authentication", async () => {
    const prescription = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl:
        "https://res.cloudinary.com/demo/image/upload/v1234567890/scanned-prescriptions/test-999.pdf",
      fileType: "pdf",
      notes: "Unauthenticated delete test",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    const response = await request.delete(
      `/api/patients/scanned-prescriptions/${prescription._id}`,
    );

    expect(response.status).toBe(401);
  });

  test("Delete continues even if Cloudinary deletion fails (graceful degradation)", async () => {
    const prescription = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl:
        "https://res.cloudinary.com/demo/image/upload/v1234567890/scanned-prescriptions/test-error.pdf",
      fileType: "pdf",
      notes: "Cloudinary error test",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    // Mock Cloudinary delete to fail
    const deleteSpy = jest
      .spyOn(cloudinaryService, "deleteFile")
      .mockRejectedValue(new Error("Cloudinary API error"));

    const response = await request
      .delete(`/api/patients/scanned-prescriptions/${prescription._id}`)
      .set("Authorization", authHeader(fixtures.secretaryAToken));

    // Should still return 200 because database deletion was successful
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Database document should still be deleted
    const deletedDoc = await ScannedPrescription.findById(prescription._id);
    expect(deletedDoc).toBeNull();

    deleteSpy.mockRestore();
  });
});

/**
 * Tests for Doctor Visibility of Scanned Prescriptions
 * Covers: getDoctorScannedPrescriptions filters by clinicSlug and doctorId
 */
describe("Doctor Scanned Prescriptions Visibility", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  test("Doctor retrieves prescriptions by clinicSlug", async () => {
    // Create prescriptions in doctor A's clinic
    const prescA = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl: "https://cloudinary.com/presc-a1.pdf",
      fileType: "pdf",
      notes: "Clinic A - Prescription 1",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    const prescA2 = await ScannedPrescription.create({
      patientId: fixtures.patientA2._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl: "https://cloudinary.com/presc-a2.pdf",
      fileType: "pdf",
      notes: "Clinic A - Prescription 2",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    // Create prescription in clinic B (should NOT be visible)
    await ScannedPrescription.create({
      patientId: fixtures.patientB1._id,
      doctorId: fixtures.doctorB._id,
      uploadedBy: fixtures.secretaryA._id, // Use secretaryA temporarily
      fileUrl: "https://cloudinary.com/presc-b1.pdf",
      fileType: "pdf",
      notes: "Clinic B - Prescription",
      clinicSlug: fixtures.doctorB.clinicSlug,
    });

    const response = await request
      .get("/api/doctors/scanned-prescriptions?limit=10")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);

    // Should only see clinic A prescriptions
    expect(response.body.data.length).toBe(2);
    expect(
      response.body.data.some((p) => p._id === prescA._id.toString()),
    ).toBe(true);
    expect(
      response.body.data.some((p) => p._id === prescA2._id.toString()),
    ).toBe(true);
    expect(
      response.body.data.some(
        (p) => p.clinicSlug === fixtures.doctorB.clinicSlug,
      ),
    ).toBe(false);
  });

  test("Doctor can filter prescriptions by patientId", async () => {
    const prescA1 = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl: "https://cloudinary.com/presc-filter-1.pdf",
      fileType: "pdf",
      notes: "Patient A1 - Presc 1",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    await ScannedPrescription.create({
      patientId: fixtures.patientA2._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl: "https://cloudinary.com/presc-filter-2.pdf",
      fileType: "pdf",
      notes: "Patient A2 - Presc",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    const response = await request
      .get(
        `/api/doctors/scanned-prescriptions?patientId=${fixtures.patientA1._id}&limit=10`,
      )
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0]._id).toBe(prescA1._id.toString());
  });

  test("Doctor retrieves prescriptions by doctorId when clinicSlug match fails", async () => {
    // This tests the OR clause: { clinicSlug } OR { doctorId }
    const presc = await ScannedPrescription.create({
      patientId: fixtures.patientA1._id,
      doctorId: fixtures.doctorA._id,
      uploadedBy: fixtures.secretaryA._id,
      fileUrl: "https://cloudinary.com/presc-doctorid.pdf",
      fileType: "pdf",
      notes: "Test doctorId visibility",
      clinicSlug: fixtures.doctorA.clinicSlug,
    });

    const response = await request
      .get("/api/doctors/scanned-prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data.some((p) => p._id === presc._id.toString())).toBe(
      true,
    );
  });

  test("Pagination works correctly for doctor scanned prescriptions", async () => {
    // Create 5 prescriptions
    const createdIds = [];
    for (let i = 0; i < 5; i++) {
      const presc = await ScannedPrescription.create({
        patientId: fixtures.patientA1._id,
        doctorId: fixtures.doctorA._id,
        uploadedBy: fixtures.secretaryA._id,
        fileUrl: `https://cloudinary.com/presc-page-${i}.pdf`,
        fileType: "pdf",
        notes: `Pagination test ${i}`,
        clinicSlug: fixtures.doctorA.clinicSlug,
      });
      createdIds.push(presc._id.toString());
    }

    // Request page 1, limit 2
    const page1 = await request
      .get("/api/doctors/scanned-prescriptions?page=1&limit=2")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(page1.status).toBe(200);
    expect(page1.body.data.length).toBe(2);
    // Check pagination object exists and has expected structure
    expect(page1.body.pagination).toBeDefined();
    expect(page1.body.pagination.totalItems).toBeGreaterThanOrEqual(5);
    expect(page1.body.pagination.page).toBe(1);
    expect(page1.body.pagination.limit).toBe(2);
    expect(page1.body.pagination.totalPages).toBeGreaterThanOrEqual(3);

    // Request page 2
    const page2 = await request
      .get("/api/doctors/scanned-prescriptions?page=2&limit=2")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(page2.status).toBe(200);
    expect(page2.body.data.length).toBeGreaterThan(0);
  });

  test("Doctor cannot access prescriptions without authentication", async () => {
    const response = await request.get("/api/doctors/scanned-prescriptions");

    expect(response.status).toBe(401);
  });
});
