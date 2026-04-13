import { authHeader, request, setupAuthFixtures } from "../testUtils.js";

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
});
