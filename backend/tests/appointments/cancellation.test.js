import PatientTimelineEvent from "../../src/models/PatientTimelineEvent.js";
import InAppNotification from "../../src/models/InAppNotification.js";
import {
  authHeader,
  request,
  setupAuthFixtures,
  createAppointment,
} from "../testUtils.js";

describe("Secretary appointment cancellation", () => {
  let fixtures;
  let appointment;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();

    appointment = await createAppointment({
      doctorId: fixtures.doctorA._id,
      patientId: fixtures.patientA1._id,
      date: new Date("2026-01-01T09:00:00Z"),
      timeSlot: "09:00",
      notes: "Secretary cancel test appointment",
      status: "pending",
    });
  });

  test("Secretary can cancel an appointment and a valid timeline event is created", async () => {
    const response = await request
      .delete(`/api/doctor-appointments/${appointment._id}`)
      .set("Authorization", authHeader(fixtures.secretaryAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.status).toBe("cancelled");
    expect(response.body.data.cancelledByType).toBe("Secretary");

    const timelineEvent = await PatientTimelineEvent.findOne({
      appointmentId: appointment._id,
      eventType: "appointment_cancelled",
    });

    expect(timelineEvent).not.toBeNull();
    expect(timelineEvent.eventTitle).toBe("Appointment Cancelled");
    expect(timelineEvent.visibility).toBe("patient_visible");
    expect(timelineEvent.metadata?.cancelledBy).toBe("secretary");

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

  test("Doctor can cancel an appointment and a valid timeline event is created", async () => {
    const response = await request
      .delete(`/api/doctor-appointments/${appointment._id}`)
      .set("Authorization", authHeader(fixtures.doctorAToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.status).toBe("cancelled");
    expect(response.body.data.cancelledByType).toBe("Doctor");

    const timelineEvent = await PatientTimelineEvent.findOne({
      appointmentId: appointment._id,
      eventType: "appointment_cancelled",
    });

    expect(timelineEvent).not.toBeNull();
    expect(timelineEvent.eventTitle).toBe("Appointment Cancelled");
    expect(timelineEvent.visibility).toBe("patient_visible");
    expect(timelineEvent.metadata?.cancelledBy).toBe("doctor");
  });
});
