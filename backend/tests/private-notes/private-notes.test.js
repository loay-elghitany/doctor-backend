import {
  request,
  createDoctor,
  createPatient,
  createSecretary,
  loginDoctor,
  loginPatient,
  loginSecretary,
  authHeader,
} from "../testUtils.js";

describe("Private Notes API", () => {
  let doctor, patient, secretary, doctorToken, patientToken, secretaryToken;
  let otherDoctorSameClinic, patientOtherDoctor;
  let doctorDifferentClinic, patientDifferentClinic;

  beforeEach(async () => {
    // Create test entities
    doctor = await createDoctor({
      name: "Test Doctor",
      email: "doctor-private@example.com",
      password: "doctorpass",
      clinicSlug: "private-notes-clinic",
    });

    patient = await createPatient({
      name: "Test Patient",
      email: "patient-private@example.com",
      password: "patientpass",
      doctorId: doctor._id,
      clinicSlug: doctor.clinicSlug,
    });

    secretary = await createSecretary({
      name: "Test Secretary",
      email: "secretary-private@example.com",
      password: "secretarypass",
      doctorId: doctor._id,
      clinicSlug: doctor.clinicSlug,
    });

    // Another doctor in the same clinic
    otherDoctorSameClinic = await createDoctor({
      name: "Other Doctor Same Clinic",
      email: "other-doctor-same@example.com",
      password: "otherpass",
      clinicSlug: "private-notes-clinic", // Same clinic
    });

    patientOtherDoctor = await createPatient({
      name: "Patient of Other Doctor",
      email: "patient-other@example.com",
      password: "patientpass",
      doctorId: otherDoctorSameClinic._id, // Different doctorId
      clinicSlug: "private-notes-clinic", // Same clinic
    });

    // Doctor in different clinic
    doctorDifferentClinic = await createDoctor({
      name: "Doctor Different Clinic",
      email: "doctor-different@example.com",
      password: "differentpass",
      clinicSlug: "different-clinic",
    });

    patientDifferentClinic = await createPatient({
      name: "Patient Different Clinic",
      email: "patient-different@example.com",
      password: "patientpass",
      doctorId: doctorDifferentClinic._id,
      clinicSlug: "different-clinic",
    });

    // Login to get tokens
    doctorToken = (
      await loginDoctor({ email: doctor.email, password: "doctorpass" })
    ).token;
    patientToken = (
      await loginPatient({ email: patient.email, password: "patientpass" })
    ).token;
    secretaryToken = (
      await loginSecretary({
        email: secretary.email,
        password: "secretarypass",
      })
    ).token;

  describe("GET /api/doctors/patients/:patientId/private-notes", () => {
    test("Doctor can retrieve their own private notes", async () => {
      // First create a note
      await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send({
          content: "Test private note",
          color: "yellow",
          isPinned: false,
        });

      const response = await request
        .get(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].content).toBe("Test private note");
    });

    test("Secretary cannot access private notes (403 Forbidden)", async () => {
      const response = await request
        .get(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(secretaryToken));

      expect(response.status).toBe(403);
    });

    test("Patient cannot access private notes (403 Forbidden)", async () => {
      const response = await request
        .get(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(patientToken));

      expect(response.status).toBe(403);
    });

    test("Unauthorized request returns 401", async () => {
      const response = await request.get(
        `/api/doctors/patients/${patient._id}/private-notes`,
      );

      expect(response.status).toBe(401);
    });

    test("Doctor cannot access notes for patient not assigned to them", async () => {
      // Create another doctor and patient
      const otherDoctor = await createDoctor({
        name: "Other Doctor",
        email: "other-doctor@example.com",
        password: "otherpass",
        clinicSlug: "other-clinic",
      });

      const otherPatient = await createPatient({
        name: "Other Patient",
        email: "other-patient@example.com",
        password: "otherpass",
        doctorId: otherDoctor._id,
        clinicSlug: otherDoctor.clinicSlug,
      });

      const response = await request
        .get(`/api/doctors/patients/${otherPatient._id}/private-notes`)
        .set(authHeader(doctorToken));

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/doctors/patients/:patientId/private-notes", () => {
    test("Doctor can create private notes", async () => {
      const noteData = {
        content: "New private note",
        color: "red",
        isPinned: true,
      };

      const response = await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send(noteData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(noteData.content);
      expect(response.body.data.color).toBe(noteData.color);
      expect(response.body.data.isPinned).toBe(noteData.isPinned);
      expect(response.body.data.patientId).toBe(String(patient._id));
      expect(response.body.data.doctorId).toBe(String(doctor._id));
    });

    test("Secretary cannot create private notes (403 Forbidden)", async () => {
      const response = await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(secretaryToken))
        .send({ content: "Unauthorized note" });

      expect(response.status).toBe(403);
    });

    test("Patient cannot create private notes (403 Forbidden)", async () => {
      const response = await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(patientToken))
        .send({ content: "Unauthorized note" });

      expect(response.status).toBe(403);
    });

    test("Validation: content is required", async () => {
      const response = await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send({ color: "blue" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("required");
    });

    test("Validation: empty content fails", async () => {
      const response = await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send({ content: "   " });

      expect(response.status).toBe(400);
    });
  });

  describe("PUT /api/doctors/patients/:patientId/private-notes/:noteId", () => {
    let noteId;

    beforeEach(async () => {
      // Create a note first
      const createResponse = await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send({
          content: "Original note",
          color: "yellow",
          isPinned: false,
        });

      noteId = createResponse.body.data._id;
    });

    test("Doctor can update their own notes", async () => {
      const updateData = {
        content: "Updated note",
        color: "green",
        isPinned: true,
      };

      const response = await request
        .put(`/api/doctors/patients/${patient._id}/private-notes/${noteId}`)
        .set(authHeader(doctorToken))
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.content).toBe(updateData.content);
      expect(response.body.data.color).toBe(updateData.color);
      expect(response.body.data.isPinned).toBe(updateData.isPinned);
    });

    test("Secretary cannot update notes (403 Forbidden)", async () => {
      const response = await request
        .put(`/api/doctors/patients/${patient._id}/private-notes/${noteId}`)
        .set(authHeader(secretaryToken))
        .send({ content: "Unauthorized update" });

      expect(response.status).toBe(403);
    });

    test("Patient cannot update notes (403 Forbidden)", async () => {
      const response = await request
        .put(`/api/doctors/patients/${patient._id}/private-notes/${noteId}`)
        .set(authHeader(patientToken))
        .send({ content: "Unauthorized update" });

      expect(response.status).toBe(403);
    });

    test("Doctor cannot update non-existent note", async () => {
      const fakeId = "507f1f77bcf86cd799439011";
      const response = await request
        .put(`/api/doctors/patients/${patient._id}/private-notes/${fakeId}`)
        .set(authHeader(doctorToken))
        .send({ content: "Update attempt" });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/doctors/patients/:patientId/private-notes/:noteId", () => {
    let noteId;

    beforeEach(async () => {
      // Create a note first
      const createResponse = await request
        .post(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send({ content: "Note to delete" });

      noteId = createResponse.body.data._id;
    });

    test("Doctor can delete their own notes", async () => {
      const response = await request
        .delete(`/api/doctors/patients/${patient._id}/private-notes/${noteId}`)
        .set(authHeader(doctorToken));

      expect(response.status).toBe(200);

      // Verify note is deleted
      const getResponse = await request
        .get(`/api/doctors/patients/${patient._id}/private-notes`)
        .set(authHeader(doctorToken));

      expect(getResponse.body.data.length).toBe(0);
    });

    test("Secretary cannot delete notes (403 Forbidden)", async () => {
      const response = await request
        .delete(`/api/doctors/patients/${patient._id}/private-notes/${noteId}`)
        .set(authHeader(secretaryToken));

      expect(response.status).toBe(403);
    });

    test("Patient cannot delete notes (403 Forbidden)", async () => {
      const response = await request
        .delete(`/api/doctors/patients/${patient._id}/private-notes/${noteId}`)
        .set(authHeader(patientToken));

      expect(response.status).toBe(403);
    });

    test("Doctor cannot delete non-existent note", async () => {
      const fakeId = "507f1f77bcf86cd799439011";
      const response = await request
        .delete(`/api/doctors/patients/${patient._id}/private-notes/${fakeId}`)
        .set(authHeader(doctorToken));

      expect(response.status).toBe(404);
    });
  });

  // Additional tests for clinic-based access
  describe("Clinic-based Access Control", () => {
    test("Doctor can create private notes for patient in same clinic but different doctorId", async () => {
      const response = await request
        .post(`/api/doctors/patients/${patientOtherDoctor._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send({
          content: "Note for patient of different doctor in same clinic",
          color: "blue",
          isPinned: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe("Note for patient of different doctor in same clinic");
    });

    test("Doctor cannot access patient in different clinic", async () => {
      const response = await request
        .get(`/api/doctors/patients/${patientDifferentClinic._id}/private-notes`)
        .set(authHeader(doctorToken));

      expect(response.status).toBe(404);
      expect(response.body.message).toContain("not assigned to this clinic");
    });

    test("Doctor cannot create notes for patient in different clinic", async () => {
      const response = await request
        .post(`/api/doctors/patients/${patientDifferentClinic._id}/private-notes`)
        .set(authHeader(doctorToken))
        .send({
          content: "Unauthorized note",
          color: "red",
          isPinned: false,
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain("not assigned to this clinic");
    });
  });
});
