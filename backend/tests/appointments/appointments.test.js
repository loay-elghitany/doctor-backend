import {
  authHeader,
  request,
  setupAuthFixtures,
  createAppointment,
} from "../testUtils.js";

describe("Unified appointments endpoint", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
    await createAppointment({
      doctorId: fixtures.doctorA._id,
      patientId: fixtures.patientA1._id,
      date: new Date("2026-01-01T09:00:00Z"),
      timeSlot: "09:00",
      notes: "Doctor A patient appointment",
    });
    await createAppointment({
      doctorId: fixtures.doctorB._id,
      patientId: fixtures.patientB1._id,
      date: new Date("2026-01-02T09:00:00Z"),
      timeSlot: "10:00",
      notes: "Doctor B patient appointment",
    });
  });

  test("GET /api/appointments returns data per doctor role", async () => {
    const response = await request
      .get("/api/appointments")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].notes).toBe("Doctor A patient appointment");
  });

  test("GET /api/appointments returns data per secretary role", async () => {
    const response = await request
      .get("/api/appointments")
      .set("Authorization", authHeader(fixtures.secretaryAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].notes).toBe("Doctor A patient appointment");
  });

  test("GET /api/appointments returns data per patient role", async () => {
    const response = await request
      .get("/api/appointments")
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].patientId?.name).toBe("Patient A1");
  });

  test("GET /api/appointments denies access when token is missing", async () => {
    const response = await request.get("/api/appointments");
    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/no token/i);
  });
});
