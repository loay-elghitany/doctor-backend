import Appointment from "../../src/models/Appointment.js";
import Prescription from "../../src/models/Prescription.js";
import { authHeader, request, setupAuthFixtures } from "../testUtils.js";

describe("Prescription Management", () => {
  let fixtures;
  let appointment;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    appointment = await Appointment.create({
      doctorId: fixtures.doctorA._id,
      patientId: fixtures.patientA1._id,
      date: futureDate,
      timeSlot: "10:00",
      status: "scheduled",
      notes: "Prescription appointment",
    });
  });

  test("Doctor can create a prescription for their appointment", async () => {
    const response = await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [
          { name: "Amoxicillin", dosage: "500mg", frequency: "3 times/day" },
        ],
        diagnosis: "Upper respiratory infection",
        notes: "Take after meals",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.appointmentId.toString()).toBe(
      appointment._id.toString(),
    );
    expect(response.body.data.doctorId.toString()).toBe(
      fixtures.doctorA._id.toString(),
    );
    expect(response.body.data.patientId.toString()).toBe(
      fixtures.patientA1._id.toString(),
    );

    const persisted = await Prescription.findById(response.body.data._id);
    expect(persisted).not.toBeNull();
    expect(persisted.medications.length).toBe(1);
    expect(persisted.diagnosis).toBe("Upper respiratory infection");
  });

  test("Cannot create a prescription without medications", async () => {
    const response = await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [],
        diagnosis: "Headache",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/medication/i);
  });

  test("Doctor cannot create a prescription for another doctor's appointment", async () => {
    const response = await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorBToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [
          { name: "Ibuprofen", dosage: "200mg", frequency: "2 times/day" },
        ],
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test("Doctor can retrieve their prescriptions with pagination", async () => {
    await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [{ name: "Medicine A", dosage: "10mg" }],
      });

    await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [{ name: "Medicine B", dosage: "5mg" }],
      });

    const response = await request
      .get("/api/prescriptions/doctor?page=1&limit=1")
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBe(1);
    expect(response.body.pagination).toBeDefined();
    expect(response.body.pagination.totalItems).toBeGreaterThanOrEqual(2);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(1);
  });

  test("Patient can retrieve prescriptions for their appointment", async () => {
    const createResponse = await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [{ name: "Vitamin C", dosage: "500mg" }],
      });

    expect(createResponse.status).toBe(201);

    const response = await request
      .get(`/api/prescriptions/appointment/${appointment._id.toString()}`)
      .set("Authorization", authHeader(fixtures.patientA1Token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    expect(response.body.data[0].appointmentId._id.toString()).toBe(
      appointment._id.toString(),
    );
  });

  test("Patient cannot retrieve another patient's prescription", async () => {
    await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [{ name: "Vitamin D", dosage: "1000 IU" }],
      });

    const response = await request
      .get(`/api/prescriptions/appointment/${appointment._id.toString()}`)
      .set("Authorization", authHeader(fixtures.patientB1Token));

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test("Doctor can delete their prescription", async () => {
    const createResponse = await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [{ name: "Metformin", dosage: "500mg" }],
      });

    const prescriptionId = createResponse.body.data._id;
    const deleteResponse = await request
      .delete(`/api/prescriptions/${prescriptionId}`)
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);

    const deleted = await Prescription.findById(prescriptionId);
    expect(deleted).toBeNull();
  });

  test("Doctor cannot delete another doctor's prescription", async () => {
    const createResponse = await request
      .post("/api/prescriptions")
      .set("Authorization", authHeader(fixtures.doctorAToken))
      .send({
        appointmentId: appointment._id.toString(),
        medications: [{ name: "Lisinopril", dosage: "10mg" }],
      });

    const prescriptionId = createResponse.body.data._id;
    const response = await request
      .delete(`/api/prescriptions/${prescriptionId}`)
      .set("Authorization", authHeader(fixtures.doctorBToken));

    expect(response.status).toBe(403);
    expect(response.body.success).toBeFalsy();
    expect(response.body.message).toMatch(/forbidden|not authorized/i);
  });
});
