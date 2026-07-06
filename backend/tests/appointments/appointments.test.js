import {
  authHeader,
  request,
  setupAuthFixtures,
  createAppointment,
} from "../testUtils.js";
import Appointment from "../../src/models/Appointment.js";
import { APPOINTMENT_STATUS } from "../../src/utils/appointmentConstants.js";
import { getNextQueueNumberForDoctorDay } from "../../src/controllers/appointmentController.js";

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

  test("getNextQueueNumberForDoctorDay uses the highest active queue number for the doctor/day", async () => {
    const date = new Date("2026-01-03T09:00:00Z");

    await Appointment.create([
      {
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date,
        timeSlot: "09:00",
        status: APPOINTMENT_STATUS.SCHEDULED,
        queueNumber: 1,
      },
      {
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA2._id,
        date,
        timeSlot: "09:30",
        status: APPOINTMENT_STATUS.SCHEDULED,
        queueNumber: 3,
      },
      {
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date,
        timeSlot: "10:00",
        status: APPOINTMENT_STATUS.CANCELLED,
        queueNumber: 9,
      },
      {
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA2._id,
        date,
        timeSlot: "10:30",
        status: APPOINTMENT_STATUS.REJECTED,
        queueNumber: 12,
      },
    ]);

    const nextQueueNumber = await getNextQueueNumberForDoctorDay({
      doctorId: fixtures.doctorA._id,
      date,
    });

    expect(nextQueueNumber).toBe(4);
  });
});
