import supertest from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Doctor from "../src/models/Doctor.js";
import Patient from "../src/models/Patient.js";
import Secretary from "../src/models/Secretary.js";
import Appointment from "../src/models/Appointment.js";

export const request = supertest(app);
export const authHeader = (token) => `Bearer ${token}`;

export const createDoctor = async ({ name, email, password, clinicSlug }) => {
  return Doctor.create({ name, email, password, clinicSlug });
};

export const createPatient = async ({
  name,
  email,
  password,
  doctorId,
  clinicSlug,
}) => {
  return Patient.create({ name, email, password, doctorId, clinicSlug });
};

export const createSecretary = async ({ name, email, password, doctorId }) => {
  return Secretary.create({ name, email, password, doctorId });
};

export const createAppointment = async ({
  doctorId,
  patientId,
  date,
  timeSlot = "09:00",
  notes = "Test appointment",
  status = "pending",
}) => {
  return Appointment.create({
    doctorId,
    patientId,
    date,
    timeSlot,
    notes,
    status,
  });
};

export const loginDoctor = async ({ email, password }) => {
  const response = await request
    .post("/api/doctors/login")
    .send({ email, password });
  return response.body.data?.token;
};

export const loginPatient = async ({ email, password }) => {
  const response = await request
    .post("/api/patients/login")
    .send({ email, password });
  return response.body.data?.token;
};

export const loginSecretary = async ({ email, password }) => {
  const response = await request
    .post("/api/secretaries/login")
    .send({ email, password });
  return response.body.data?.token;
};

export const setupAuthFixtures = async () => {
  const doctorA = await createDoctor({
    name: "Doctor A",
    email: "doctorA@example.com",
    password: "doctorApass",
    clinicSlug: "doc-a",
  });

  const doctorB = await createDoctor({
    name: "Doctor B",
    email: "doctorB@example.com",
    password: "doctorBpass",
    clinicSlug: "doc-b",
  });

  const patientA1 = await createPatient({
    name: "Patient A1",
    email: "patientA1@example.com",
    password: "patientA1pass",
    doctorId: doctorA._id,
    clinicSlug: "doc-a",
  });

  const patientA2 = await createPatient({
    name: "Patient A2",
    email: "patientA2@example.com",
    password: "patientA2pass",
    doctorId: doctorA._id,
    clinicSlug: "doc-a",
  });

  const patientB1 = await createPatient({
    name: "Patient B1",
    email: "patientB1@example.com",
    password: "patientB1pass",
    doctorId: doctorB._id,
    clinicSlug: "doc-b",
  });

  const secretaryA = await createSecretary({
    name: "Secretary A",
    email: "secretaryA@example.com",
    password: "secretaryApass",
    doctorId: doctorA._id,
  });

  const doctorAToken = await loginDoctor({
    email: doctorA.email,
    password: "doctorApass",
  });
  const doctorBToken = await loginDoctor({
    email: doctorB.email,
    password: "doctorBpass",
  });
  const patientA1Token = await loginPatient({
    email: patientA1.email,
    password: "patientA1pass",
  });
  const patientB1Token = await loginPatient({
    email: patientB1.email,
    password: "patientB1pass",
  });
  const secretaryAToken = await loginSecretary({
    email: secretaryA.email,
    password: "secretaryApass",
  });

  return {
    doctorA,
    doctorB,
    patientA1,
    patientA2,
    patientB1,
    secretaryA,
    doctorAToken,
    doctorBToken,
    patientA1Token,
    patientB1Token,
    secretaryAToken,
  };
};

export const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);
