import { authHeader, request, setupAuthFixtures } from "../testUtils.js";
import Patient from "../../src/models/Patient.js";
import InAppNotification from "../../src/models/InAppNotification.js";

describe("Patients unified endpoint", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  test("GET /api/patients returns correct data for doctor role", async () => {
    const response = await request
      .get("/api/patients")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(
      response.body.data.some(
        (patient) => patient.email === "patienta1@example.com",
      ),
    ).toBe(true);
    expect(
      response.body.data.some(
        (patient) => patient.email === "patientb1@example.com",
      ),
    ).toBe(false);
  });

  test("GET /api/patients returns current patient only for patient role", async () => {
    const response = await request
      .get("/api/patients")
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].email).toBe("patienta1@example.com");
  });

  describe("Secretary Patient Creation", () => {
    test("Secretary can register a new patient with correct data mapping and secure notifications", async () => {
      const testPhoneNumber = "+201001234567";
      const testPassword = "testPatientPassword123";

      const response = await request
        .post("/api/secretaries/patients")
        .set("Authorization", authHeader(fixtures.secretaryAToken))
        .send({
          name: "New Test Patient",
          email: "newsecretarypatient@example.com",
          password: testPassword,
          phoneNumber: testPhoneNumber,
          clinicSlug: "doc-a",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verify the patient was saved with correct phoneNumber (NOT password)
      const savedPatient = await Patient.findById(response.body.data._id);
      expect(savedPatient).not.toBeNull();
      expect(savedPatient.phoneNumber).toBe(testPhoneNumber);
      expect(savedPatient.phoneNumber).not.toBe(testPassword);
      expect(savedPatient.email).toBe("newsecretarypatient@example.com");
      expect(savedPatient.name).toBe("New Test Patient");

      // Verify in-app notification was created
      // Wait a bit for async notification creation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const notificationCount = await InAppNotification.countDocuments({
        type: "NEW_PATIENT_REGISTERED",
        patientId: response.body.data._id,
      });

      expect(notificationCount).toBeGreaterThan(0);
    });
  });
});
