import { authHeader, request, setupAuthFixtures } from "../testUtils.js";

describe("RBAC", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  test("Doctor cannot access patient-only endpoints", async () => {
    const response = await request
      .get("/api/patients/me")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/forbidden/i);
  });

  test("Patient cannot access doctor-only endpoints", async () => {
    const response = await request
      .get("/api/doctors/patients")
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/forbidden/i);
  });

  test("Secretary can access allowed shared endpoints", async () => {
    const response = await request
      .get("/api/doctors/patients")
      .set("Authorization", authHeader(fixtures.secretaryAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test("Unauthorized role combinations return 403", async () => {
    const response = await request
      .get("/api/appointments")
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const forbidden = await request
      .get("/api/doctors/patients")
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toMatch(/forbidden/i);
  });
});
