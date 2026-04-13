import { authHeader, request, setupAuthFixtures } from "../testUtils.js";

describe("Multi-tenant isolation", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  test("Doctor A cannot see Doctor B patients", async () => {
    const response = await request
      .get("/api/patients")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const patientEmails = response.body.data.map((p) => p.email);
    expect(patientEmails).toContain("patienta1@example.com");
    expect(patientEmails).toContain("patienta2@example.com");
    expect(patientEmails).not.toContain("patientb1@example.com");
  });

  test("Secretary only sees patients of assigned doctor", async () => {
    const response = await request
      .get("/api/patients")
      .set("Authorization", authHeader(fixtures.secretaryAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    const patientIds = response.body.data.map((p) => p._id);
    expect(patientIds).toContain(String(fixtures.patientA1._id));
    expect(patientIds).toContain(String(fixtures.patientA2._id));
  });

  test("Patient only sees their own data", async () => {
    const response = await request
      .get("/api/patients")
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].email).toBe("patienta1@example.com");
  });

  test("GET /api/patients respects tenant filtering", async () => {
    const responseDoctorB = await request
      .get("/api/patients")
      .set("Authorization", authHeader(fixtures.doctorBToken));

    expect(responseDoctorB.status).toBe(200);
    expect(responseDoctorB.body.success).toBe(true);
    expect(responseDoctorB.body.data).toHaveLength(1);
    expect(responseDoctorB.body.data[0].email).toBe("patientb1@example.com");
  });
});
