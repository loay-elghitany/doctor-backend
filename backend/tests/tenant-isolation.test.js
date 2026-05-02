import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Doctor from "../src/models/Doctor.js";
import Patient from "../src/models/Patient.js";
import Appointment from "../src/models/Appointment.js";
import { APPOINTMENT_STATUS } from "../src/utils/appointmentConstants.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

describe("Tenant isolation - Doctor A vs Doctor B", () => {
  let doctorA;
  let doctorB;
  let doctorBToken;
  let patientA;
  let appointmentA;

  const loginDoctor = async ({ email, password }) => {
    const response = await request(app)
      .post("/api/doctors/login")
      .send({ email, password });

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toBeDefined();
    return response.body.data.token;
  };

  beforeEach(async () => {
    doctorA = await Doctor.create({
      name: "Doctor A",
      email: "doctor-a@example.com",
      password: "StrongPassword1!",
      clinicSlug: "clinic-a",
    });

    doctorB = await Doctor.create({
      name: "Doctor B",
      email: "doctor-b@example.com",
      password: "StrongPassword1!",
      clinicSlug: "clinic-b",
    });

    doctorBToken = await loginDoctor({
      email: "doctor-b@example.com",
      password: "StrongPassword1!",
    });

    patientA = await Patient.create({
      name: "Patient A",
      email: "patient-a@example.com",
      password: "StrongPassword1!",
      doctorId: doctorA._id,
      clinicSlug: doctorA.clinicSlug,
    });

    appointmentA = await Appointment.create({
      doctorId: doctorA._id,
      patientId: patientA._id,
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      timeSlot: "10:00",
      status: APPOINTMENT_STATUS.SCHEDULED,
      createdBy: "doctor",
      createdByRef: "Doctor",
      createdById: doctorA._id,
    });
  });

  it("should prevent Doctor B from reading Doctor A's patient timeline", async () => {
    const response = await request(app)
      .get(`/api/doctor/patients/${patientA._id}/timeline`)
      .set("Authorization", `Bearer ${doctorBToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/not authorized/i);
    expect(response.body.data).toBeNull();
  });

  it("should prevent Doctor B from updating Doctor A's appointment", async () => {
    const response = await request(app)
      .put(`/api/doctor-appointments/${appointmentA._id}`)
      .set("Authorization", `Bearer ${doctorBToken}`)
      .send({ status: APPOINTMENT_STATUS.PENDING })
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/appointment not found/i);
    expect(response.body.data).toBeNull();
  });

  it("should prevent Doctor B from deleting Doctor A's appointment", async () => {
    const response = await request(app)
      .delete(`/api/doctor-appointments/${appointmentA._id}`)
      .set("Authorization", `Bearer ${doctorBToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/appointment not found/i);
    expect(response.body.data).toBeNull();
  });
});

describe("Tenant isolation - List endpoints isolation", () => {
  let doctorA;
  let doctorB;
  let doctorBToken;
  let patientA;
  let appointmentA;

  const loginDoctor = async ({ email, password }) => {
    const response = await request(app)
      .post("/api/doctors/login")
      .send({ email, password });

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toBeDefined();
    return response.body.data.token;
  };

  beforeEach(async () => {
    doctorA = await Doctor.create({
      name: "Doctor A",
      email: "doctor-a-list@example.com",
      password: "StrongPassword1!",
      clinicSlug: "clinic-a-list",
    });

    doctorB = await Doctor.create({
      name: "Doctor B",
      email: "doctor-b-list@example.com",
      password: "StrongPassword1!",
      clinicSlug: "clinic-b-list",
    });

    doctorBToken = await loginDoctor({
      email: "doctor-b-list@example.com",
      password: "StrongPassword1!",
    });

    patientA = await Patient.create({
      name: "Patient A",
      email: "patient-a-list@example.com",
      password: "StrongPassword1!",
      doctorId: doctorA._id,
      clinicSlug: doctorA.clinicSlug,
    });

    appointmentA = await Appointment.create({
      doctorId: doctorA._id,
      patientId: patientA._id,
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      timeSlot: "14:00",
      status: APPOINTMENT_STATUS.SCHEDULED,
      createdBy: "doctor",
      createdByRef: "Doctor",
      createdById: doctorA._id,
    });
  });

  it("should prevent Doctor B from seeing Doctor A's patient in /api/patients list", async () => {
    const response = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${doctorBToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);

    // Assert Doctor B's patient list does NOT contain Doctor A's patient
    const patientIds = response.body.data.map((p) => p._id.toString());
    expect(patientIds).not.toContain(patientA._id.toString());
  });

  it("should prevent Doctor B from seeing Doctor A's appointment in /api/doctor-appointments list", async () => {
    const response = await request(app)
      .get("/api/doctor-appointments")
      .set("Authorization", `Bearer ${doctorBToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);

    // Assert Doctor B's appointment list does NOT contain Doctor A's appointment
    const appointmentIds = response.body.data.map((a) => a._id.toString());
    expect(appointmentIds).not.toContain(appointmentA._id.toString());
  });

  it("should ensure Doctor A's patient and appointment are not in Doctor B's view", async () => {
    // Get Doctor B's view of both endpoints
    const patientsResponse = await request(app)
      .get("/api/patients")
      .set("Authorization", `Bearer ${doctorBToken}`)
      .expect(200);

    const appointmentsResponse = await request(app)
      .get("/api/doctor-appointments")
      .set("Authorization", `Bearer ${doctorBToken}`)
      .expect(200);

    // Verify isolation
    const patientIds = patientsResponse.body.data.map((p) => p._id.toString());
    const appointmentIds = appointmentsResponse.body.data.map((a) =>
      a._id.toString(),
    );

    expect(patientIds).not.toContain(patientA._id.toString());
    expect(appointmentIds).not.toContain(appointmentA._id.toString());

    // Doctor B should have zero patients and appointments since they were just created
    expect(patientIds.length).toBe(0);
    expect(appointmentIds.length).toBe(0);
  });
});
