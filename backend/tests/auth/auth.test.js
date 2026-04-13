import {
  verifyToken,
  createDoctor,
  createPatient,
  createSecretary,
  request,
} from "../testUtils.js";
import {
  authHeader,
  loginDoctor,
  loginPatient,
  loginSecretary,
} from "../testUtils.js";

describe("Authentication", () => {
  test("Doctor login returns valid JWT", async () => {
    const doctor = await createDoctor({
      name: "Doctor Login",
      email: "doctor-login@example.com",
      password: "doctorpass",
      clinicSlug: "doc-login",
    });

    const response = await request
      .post("/api/doctors/login")
      .send({ email: doctor.email, password: "doctorpass" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data?.token).toBeDefined();

    const tokenPayload = verifyToken(response.body.data.token);
    expect(tokenPayload.role).toBe("doctor");
    expect(tokenPayload.id).toBe(String(doctor._id));
  });

  test("Patient login returns valid JWT", async () => {
    const doctor = await createDoctor({
      name: "Patient Login Doctor",
      email: "doctor-patient-login@example.com",
      password: "doctorpass2",
      clinicSlug: "doc-patient-login",
    });

    const patient = await createPatient({
      name: "Patient Login",
      email: "patient-login@example.com",
      password: "patientpass",
      doctorId: doctor._id,
      clinicSlug: doctor.clinicSlug,
    });

    const response = await request
      .post("/api/patients/login")
      .send({ email: patient.email, password: "patientpass" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data?.token).toBeDefined();

    const tokenPayload = verifyToken(response.body.data.token);
    expect(tokenPayload.role).toBe("patient");
    expect(tokenPayload.id).toBe(String(patient._id));
  });

  test("Secretary login returns valid JWT", async () => {
    const doctor = await createDoctor({
      name: "Secretary Login Doctor",
      email: "doctor-sec-login@example.com",
      password: "doctorpass3",
      clinicSlug: "doc-sec-login",
    });

    const secretary = await createSecretary({
      name: "Secretary Login",
      email: "secretary-login@example.com",
      password: "secretarypass",
      doctorId: doctor._id,
    });

    const response = await request
      .post("/api/secretaries/login")
      .send({ email: secretary.email, password: "secretarypass" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data?.token).toBeDefined();

    const tokenPayload = verifyToken(response.body.data.token);
    expect(tokenPayload.role).toBe("secretary");
    expect(tokenPayload.id).toBe(String(secretary._id));
    expect(tokenPayload.doctorId).toBe(String(doctor._id));
  });

  test("Invalid credentials fail properly", async () => {
    const doctor = await createDoctor({
      name: "Doctor Invalid",
      email: "doctor-invalid@example.com",
      password: "doctorpass4",
      clinicSlug: "doc-invalid",
    });

    const response = await request
      .post("/api/doctors/login")
      .send({ email: doctor.email, password: "wrongpassword" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/invalid credentials/i);
  });

  test("Invalid token returns 401", async () => {
    const response = await request
      .get("/api/patients")
      .set("Authorization", "Bearer invalid.token.value");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/token invalid/i);
  });

  test("Missing token returns 401", async () => {
    const response = await request.get("/api/patients");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/no token/i);
  });
});
