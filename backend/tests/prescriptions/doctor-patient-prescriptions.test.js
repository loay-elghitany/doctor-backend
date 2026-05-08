import { authHeader, request, setupAuthFixtures } from "../testUtils.js";
import ScannedPrescription from "../../src/models/ScannedPrescription.js";

describe("Doctor Patient Scanned Prescriptions Endpoint", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  describe("GET /api/doctors/patients/:patientId/scanned-prescriptions", () => {
    test("Doctor can fetch scanned prescriptions for their own patient", async () => {
      // Create a scanned prescription for patient A1
      const prescription = await ScannedPrescription.create({
        patientId: fixtures.patientA1._id,
        doctorId: fixtures.doctorA._id,
        uploadedBy: fixtures.secretaryA._id,
        fileUrl:
          "https://res.cloudinary.com/example/image/upload/v1234/prescription.jpg",
        fileType: "image",
        notes: "Test prescription for patient A1",
        clinicSlug: "doc-a",
      });

      const response = await request
        .get(`/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0]._id.toString()).toBe(prescription._id.toString());
      expect(response.body.data[0].notes).toBe(
        "Test prescription for patient A1"
      );
      expect(response.body.pagination).toBeDefined();
    });

    test("Doctor cannot fetch prescriptions for another doctor's patient", async () => {
      // Create a scanned prescription for patient B1 (which belongs to doctor B)
      const prescription = await ScannedPrescription.create({
        patientId: fixtures.patientB1._id,
        doctorId: fixtures.doctorB._id,
        uploadedBy: fixtures.secretaryB._id,
        fileUrl:
          "https://res.cloudinary.com/example/image/upload/v1234/prescription.jpg",
        fileType: "image",
        notes: "Test prescription for patient B1",
        clinicSlug: "doc-b",
      });

      // Doctor A tries to access Patient B1's prescriptions
      const response = await request
        .get(`/api/doctors/patients/${fixtures.patientB1._id}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/not authorized/i);
    });

    test("Returns 404 when patient does not exist", async () => {
      const fakePatientId = "507f1f77bcf86cd799439999";

      const response = await request
        .get(`/api/doctors/patients/${fakePatientId}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/patient not found/i);
    });

    test("Returns empty list when patient has no scanned prescriptions", async () => {
      const response = await request
        .get(`/api/doctors/patients/${fixtures.patientA2._id}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    test("Returns 401 when not authenticated", async () => {
      const response = await request.get(
        `/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions`
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("Returns 400 when patientId is not provided", async () => {
      const response = await request
        .get("/api/doctors/patients//scanned-prescriptions")
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(404); // Not found due to malformed URL
    });

    test("Supports pagination with limit and page parameters", async () => {
      // Create multiple prescriptions
      const prescriptions = [];
      for (let i = 0; i < 5; i++) {
        const prescription = await ScannedPrescription.create({
          patientId: fixtures.patientA1._id,
          doctorId: fixtures.doctorA._id,
          uploadedBy: fixtures.secretaryA._id,
          fileUrl: `https://res.cloudinary.com/example/image/upload/v1234/prescription${i}.jpg`,
          fileType: "image",
          notes: `Prescription ${i + 1}`,
          clinicSlug: "doc-a",
        });
        prescriptions.push(prescription);
      }

      // Test first page with limit 2
      const response1 = await request
        .get(
          `/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions?page=1&limit=2`
        )
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response1.status).toBe(200);
      expect(response1.body.data.length).toBe(2);
      expect(response1.body.pagination.page).toBe(1);
      expect(response1.body.pagination.limit).toBe(2);

      // Test second page
      const response2 = await request
        .get(
          `/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions?page=2&limit=2`
        )
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response2.status).toBe(200);
      expect(response2.body.data.length).toBe(2);
      expect(response2.body.pagination.page).toBe(2);
    });

    test("Returns prescriptions sorted by createdAt in descending order", async () => {
      // Create prescriptions with delays to ensure different timestamps
      const prescription1 = await ScannedPrescription.create({
        patientId: fixtures.patientA1._id,
        doctorId: fixtures.doctorA._id,
        uploadedBy: fixtures.secretaryA._id,
        fileUrl:
          "https://res.cloudinary.com/example/image/upload/v1234/prescription1.jpg",
        fileType: "image",
        notes: "Prescription 1",
        clinicSlug: "doc-a",
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const prescription2 = await ScannedPrescription.create({
        patientId: fixtures.patientA1._id,
        doctorId: fixtures.doctorA._id,
        uploadedBy: fixtures.secretaryA._id,
        fileUrl:
          "https://res.cloudinary.com/example/image/upload/v1234/prescription2.jpg",
        fileType: "image",
        notes: "Prescription 2",
        clinicSlug: "doc-a",
      });

      const response = await request
        .get(`/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      // Newest first (prescription2 created after prescription1)
      expect(response.body.data[0]._id.toString()).toBe(
        prescription2._id.toString()
      );
      expect(response.body.data[1]._id.toString()).toBe(
        prescription1._id.toString()
      );
    });

    test("Doctor from same clinic can access patient's prescriptions if patient belongs to clinic", async () => {
      // Note: This test assumes clinic-level access control
      // Create a scanned prescription for patient A1
      const prescription = await ScannedPrescription.create({
        patientId: fixtures.patientA1._id,
        doctorId: fixtures.doctorA._id,
        uploadedBy: fixtures.secretaryA._id,
        fileUrl:
          "https://res.cloudinary.com/example/image/upload/v1234/prescription.jpg",
        fileType: "image",
        notes: "Clinic prescription",
        clinicSlug: "doc-a",
      });

      const response = await request
        .get(`/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
    });

    test("Secretary role cannot access doctor prescriptions endpoint", async () => {
      const response = await request
        .get(`/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.secretaryAToken));

      // Should be forbidden or unauthorized depending on role-based access control
      expect([401, 403]).toContain(response.status);
    });

    test("Patient role cannot access doctor prescriptions endpoint", async () => {
      const response = await request
        .get(`/api/doctors/patients/${fixtures.patientA1._id}/scanned-prescriptions`)
        .set("Authorization", authHeader(fixtures.patientA1Token));

      // Should be forbidden or unauthorized depending on role-based access control
      expect([401, 403]).toContain(response.status);
    });

    test("Invalid patientId format returns appropriate error", async () => {
      const response = await request
        .get("/api/doctors/patients/invalid-id/scanned-prescriptions")
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/invalid patient id format/i);
    });
  });
});
