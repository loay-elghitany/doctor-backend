import Appointment from "../../src/models/Appointment.js";
import InAppNotification from "../../src/models/InAppNotification.js";
import { authHeader, request, setupAuthFixtures } from "../testUtils.js";

describe("Doctor Appointment Management", () => {
  let fixtures;
  let appointmentData;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();

    // Prepare appointment data
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dateStr = futureDate.toISOString().split("T")[0];

    appointmentData = {
      patientId: fixtures.patientA1._id.toString(),
      date: dateStr,
      timeSlot: "10:00",
      notes: "Initial consultation",
    };
  });

  describe("Create Doctor Appointments", () => {
    test("Doctor can create appointment for their patient", async () => {
      const response = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send(appointmentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.patientId.toString()).toBe(
        fixtures.patientA1._id.toString(),
      );
      expect(response.body.data.doctorId.toString()).toBe(
        fixtures.doctorA._id.toString(),
      );
      expect(response.body.data.status).toBe("scheduled");

      // Verify appointment persisted
      const appointment = await Appointment.findById(response.body.data._id);
      expect(appointment).not.toBeNull();
      expect(appointment.status).toBe("scheduled");

      // Verify InAppNotification was created with correct type
      const notification = await InAppNotification.findOne({
        appointmentId: appointment._id,
        type: "NEW_APPOINTMENT",
      });
      expect(notification).not.toBeNull();
      expect(notification.category).toBe("appointment");
      expect(notification.recipient.toString()).toBe(
        fixtures.patientA1._id.toString(),
      );
    });

    test("Secretary can create appointment for their doctor's patient", async () => {
      const response = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.secretaryAToken))
        .send(appointmentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.doctorId.toString()).toBe(
        fixtures.doctorA._id.toString(),
      );
    });

    test("Doctor cannot create appointment for another doctor's patient", async () => {
      const response = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorBToken))
        .send(appointmentData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test("Cannot create appointment without required fields", async () => {
      const response = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          // Missing date and timeSlot
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("Cannot create appointment with invalid date format", async () => {
      const response = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          date: "invalid-date",
          timeSlot: "10:00",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("Cannot create appointment with invalid time slot", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      const response = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          date: dateStr,
          timeSlot: "25:00", // Invalid hour
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Get Doctor Appointments", () => {
    beforeEach(async () => {
      // Create sample appointments
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Appointment 1",
      });

      await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA2._id,
        date: dateStr,
        timeSlot: "11:00",
        status: "scheduled",
        notes: "Appointment 2",
      });

      // Create appointment for different doctor
      await Appointment.create({
        doctorId: fixtures.doctorB._id,
        patientId: fixtures.patientB1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Doctor B appointment",
      });
    });

    test("Doctor can retrieve their appointments", async () => {
      const response = await request
        .get("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);

      // All appointments should belong to doctorA
      response.body.data.forEach((apt) => {
        expect(apt.doctorId.toString()).toBe(fixtures.doctorA._id.toString());
      });
    });

    test("Secretary can retrieve their doctor's appointments", async () => {
      const response = await request
        .get("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.secretaryAToken));

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);

      // All appointments should belong to secretaryA's doctor (doctorA)
      response.body.data.forEach((apt) => {
        expect(apt.doctorId.toString()).toBe(fixtures.doctorA._id.toString());
      });
    });

    test("Doctor cannot see other doctor's appointments", async () => {
      const response = await request
        .get("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorBToken));

      expect(response.status).toBe(200);
      // Should not contain doctorA's appointments
      response.body.data.forEach((apt) => {
        expect(apt.doctorId.toString()).not.toBe(
          fixtures.doctorA._id.toString(),
        );
      });
    });
  });

  describe("Update Appointment Status", () => {
    let appointment;

    beforeEach(async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      appointment = await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Test appointment",
      });
    });

    test("Doctor can reschedule appointment", async () => {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 10);
      const newDateStr = newDate.toISOString().split("T")[0];

      const response = await request
        .put(`/api/doctor-appointments/${appointment._id.toString()}`)
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          date: newDateStr,
          timeSlot: "14:00",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const returnedDate = new Date(response.body.data.date).toLocaleDateString(
        "en-CA",
      );
      const expectedDate = newDate.toLocaleDateString("en-CA");
      expect(returnedDate).toBe(expectedDate);
      expect(response.body.data.timeSlot).toBe("14:00");

      const updated = await Appointment.findById(appointment._id);
      expect(updated.date.toLocaleDateString("en-CA")).toBe(
        newDate.toLocaleDateString("en-CA"),
      );
      expect(updated.timeSlot).toBe("14:00");
    });

    test("Doctor can confirm appointment", async () => {
      const response = await request
        .put(`/api/doctor-appointments/${appointment._id.toString()}`)
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          status: "confirmed",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("confirmed");

      const updated = await Appointment.findById(appointment._id);
      expect(updated.status).toBe("confirmed");

      // Verify InAppNotification was created with correct type
      const notification = await InAppNotification.findOne({
        appointmentId: appointment._id,
        type: "APPOINTMENT_CONFIRMED",
      });
      expect(notification).not.toBeNull();
      expect(notification.category).toBe("appointment");
      expect(notification.recipient.toString()).toBe(
        fixtures.patientA1._id.toString(),
      );
    });

    test("Doctor cannot update another doctor's appointment", async () => {
      const response = await request
        .put(`/api/doctor-appointments/${appointment._id.toString()}`)
        .set("Authorization", authHeader(fixtures.doctorBToken))
        .send({ status: "confirmed" });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Cancel Appointment", () => {
    let appointment;

    beforeEach(async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      appointment = await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Test appointment",
      });
    });

    test("Doctor can cancel appointment", async () => {
      const response = await request
        .delete(`/api/doctor-appointments/${appointment._id.toString()}`)
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({ reason: "Patient requested cancellation" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = await Appointment.findById(appointment._id);
      expect(updated.status).toBe("cancelled");
      expect(updated.cancelledBy.toString()).toBe(
        fixtures.doctorA._id.toString(),
      );
      expect(updated.cancelledByType).toBe("Doctor");

      // Verify InAppNotification was created with correct type
      const notification = await InAppNotification.findOne({
        appointmentId: appointment._id,
        type: "APPOINTMENT_CANCELLED",
      });
      expect(notification).not.toBeNull();
      expect(notification.category).toBe("appointment");
      expect(notification.recipient.toString()).toBe(
        fixtures.patientA1._id.toString(),
      );
    });

    test("Secretary can cancel appointment", async () => {
      const response = await request
        .delete(`/api/doctor-appointments/${appointment._id.toString()}`)
        .set("Authorization", authHeader(fixtures.secretaryAToken))
        .send({ reason: "Clinic closure" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = await Appointment.findById(appointment._id);
      expect(updated.status).toBe("cancelled");
      expect(updated.cancelledByType).toBe("Secretary");
    });

    test("Doctor cannot cancel another doctor's appointment", async () => {
      const response = await request
        .delete(`/api/doctor-appointments/${appointment._id.toString()}`)
        .set("Authorization", authHeader(fixtures.doctorBToken));

      expect(response.status).toBe(404);
    });
  });

  describe("Mark Appointment Completed", () => {
    let appointment;

    beforeEach(async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      appointment = await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Test appointment",
      });
    });

    test("Doctor can mark appointment as completed", async () => {
      const response = await request
        .post(
          `/api/doctor-appointments/${appointment._id.toString()}/mark-completed`,
        )
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          notes: "Appointment completed successfully",
          diagnostics: "Patient is in good health",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("completed");

      const updated = await Appointment.findById(appointment._id);
      expect(updated.status).toBe("completed");
    });

    test("Doctor cannot mark another doctor's appointment as completed", async () => {
      const response = await request
        .post(
          `/api/doctor-appointments/${appointment._id.toString()}/mark-completed`,
        )
        .set("Authorization", authHeader(fixtures.doctorBToken))
        .send({});

      expect(response.status).toBe(404);
    });
  });

  describe("Propose Reschedule Times", () => {
    let appointment;

    beforeEach(async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      appointment = await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Test appointment",
      });
    });

    test("Doctor can propose reschedule times", async () => {
      const date1 = new Date();
      date1.setDate(date1.getDate() + 7);
      const date1Str = date1.toISOString().split("T")[0];

      const date2 = new Date();
      date2.setDate(date2.getDate() + 8);
      const date2Str = date2.toISOString().split("T")[0];

      const date3 = new Date();
      date3.setDate(date3.getDate() + 9);
      const date3Str = date3.toISOString().split("T")[0];

      const response = await request
        .patch(
          `/api/doctor-appointments/${appointment._id.toString()}/propose-times`,
        )
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          rescheduleOptions: [
            { date: date1Str, timeSlot: "09:00" },
            { date: date2Str, timeSlot: "14:00" },
            { date: date3Str, timeSlot: "16:00" },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("reschedule_proposed");
      expect(response.body.data.rescheduleOptions).toBeDefined();
      expect(response.body.data.rescheduleOptions.length).toBe(3);
    });

    test("Doctor can propose two reschedule options", async () => {
      const date1 = new Date();
      date1.setDate(date1.getDate() + 7);
      const date1Str = date1.toISOString().split("T")[0];

      const date2 = new Date();
      date2.setDate(date2.getDate() + 8);
      const date2Str = date2.toISOString().split("T")[0];

      const response = await request
        .patch(
          `/api/doctor-appointments/${appointment._id.toString()}/propose-times`,
        )
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          rescheduleOptions: [
            { date: date1Str, timeSlot: "09:00" },
            { date: date2Str, timeSlot: "14:00" },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.rescheduleOptions)).toBe(true);
      expect(response.body.data.rescheduleOptions.length).toBe(2);
      expect(response.body.data.status).toBe("reschedule_proposed");
    });
  });

  describe("Delete Appointment", () => {
    let appointment;

    beforeEach(async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      appointment = await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "cancelled",
        notes: "Test appointment",
      });
    });

    test("Doctor can soft-delete appointment", async () => {
      const response = await request
        .post(
          `/api/doctor-appointments/${appointment._id.toString()}/soft-delete`,
        )
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const deleted = await Appointment.findById(appointment._id);
      expect(deleted).not.toBeNull();
      expect(deleted.isDeleted).toBe(true);
    });

    test("Doctor cannot soft-delete another doctor's appointment", async () => {
      const response = await request
        .post(
          `/api/doctor-appointments/${appointment._id.toString()}/soft-delete`,
        )
        .set("Authorization", authHeader(fixtures.doctorBToken));

      expect(response.status).toBe(404);
    });
  });

  describe("Appointment Status Validation", () => {
    test("Appointment status must be valid enum", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      try {
        await Appointment.create({
          doctorId: fixtures.doctorA._id,
          patientId: fixtures.patientA1._id,
          date: dateStr,
          timeSlot: "10:00",
          status: "invalid_status",
          notes: "Test",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toMatch(/enum|invalid/i);
      }
    });

    test("CancelledByType must be valid enum", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      const appointment = await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Test",
      });

      // Try to update with invalid cancelledByType
      appointment.status = "cancelled";
      appointment.cancelledByType = "invalid_type";

      try {
        await appointment.save();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Appointment Tenant Isolation", () => {
    let appointmentA;

    beforeEach(async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      appointmentA = await Appointment.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
        notes: "Doctor A appointment",
      });
    });

    test("Doctor B cannot view Doctor A's appointments", async () => {
      const response = await request
        .get("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorBToken));

      expect(response.status).toBe(200);
      const appointmentIds = response.body.data.map((a) => a._id.toString());
      expect(appointmentIds).not.toContain(appointmentA._id.toString());
    });

    test("Secretary A cannot access Doctor B's appointments", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split("T")[0];

      // Create an appointment for doctor B
      const appointmentB = await Appointment.create({
        doctorId: fixtures.doctorB._id,
        patientId: fixtures.patientB1._id,
        date: dateStr,
        timeSlot: "10:00",
        status: "scheduled",
      });

      const response = await request
        .get("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.secretaryAToken));

      const appointmentIds = response.body.data.map((a) => a._id.toString());
      expect(appointmentIds).not.toContain(appointmentB._id.toString());
    });
  });

  describe("Appointment Timeline Event Creation", () => {
    test("Creating appointment generates timeline event", async () => {
      const response = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send(appointmentData);

      expect(response.status).toBe(201);

      // Verify timeline event was created (checking via PatientTimelineEvent)
      const appointment = await Appointment.findById(response.body.data._id);
      expect(appointment).not.toBeNull();
    });

    test("Cancelling appointment generates timeline event", async () => {
      // First create an appointment
      const createResponse = await request
        .post("/api/doctor-appointments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send(appointmentData);

      const appointmentId = createResponse.body.data._id;

      // Then cancel it
      const cancelResponse = await request
        .delete(`/api/doctor-appointments/${appointmentId}`)
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({ reason: "Patient requested" });

      expect(cancelResponse.status).toBe(200);

      const appointment = await Appointment.findById(appointmentId);
      expect(appointment.status).toBe("cancelled");
    });
  });
});
