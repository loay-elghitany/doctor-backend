import TreatmentPlan from "../../src/models/TreatmentPlan.js";
import Payment from "../../src/models/Payment.js";
import InAppNotification from "../../src/models/InAppNotification.js";
import { authHeader, request, setupAuthFixtures } from "../testUtils.js";

describe("Financial Management - Treatment Plans and Payments", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await setupAuthFixtures();
  });

  describe("Treatment Plans", () => {
    test("Doctor can create a treatment plan for their patient", async () => {
      const response = await request
        .post("/api/financials/plans")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          title: "Root Canal Treatment",
          totalCost: 5000,
          status: "active",
          notes: "Complex root canal procedure",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.title).toBe("Root Canal Treatment");
      expect(response.body.data.totalCost).toBe(5000);
      expect(response.body.data.status).toBe("active");

      const savedPlan = await TreatmentPlan.findById(response.body.data._id);
      expect(savedPlan).not.toBeNull();
      expect(savedPlan.doctorId.toString()).toBe(
        fixtures.doctorA._id.toString(),
      );
    });

    test("Secretary can create a treatment plan for their doctor's patient", async () => {
      const response = await request
        .post("/api/financials/plans")
        .set("Authorization", authHeader(fixtures.secretaryAToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          title: "Dental Filling",
          totalCost: 1500,
          status: "active",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe("Dental Filling");

      const savedPlan = await TreatmentPlan.findById(response.body.data._id);
      expect(savedPlan.doctorId.toString()).toBe(
        fixtures.doctorA._id.toString(),
      );
    });

    test("Doctor cannot create a plan for another doctor's patient", async () => {
      const response = await request
        .post("/api/financials/plans")
        .set("Authorization", authHeader(fixtures.doctorBToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          title: "Unauthorized Plan",
          totalCost: 1000,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test("Should require all mandatory fields for treatment plan", async () => {
      const response = await request
        .post("/api/financials/plans")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          // Missing title and totalCost
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/required/i);
    });

    test("Doctor can list treatment plans for their patients", async () => {
      // Create a plan first
      await TreatmentPlan.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        title: "Test Plan 1",
        totalCost: 2000,
        status: "active",
      });

      const response = await request
        .get(`/api/financials/patients/${fixtures.patientA1._id}/plans`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].title).toBe("Test Plan 1");
    });

    test("Doctor can update their treatment plan status", async () => {
      const plan = await TreatmentPlan.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        title: "Plan to Update",
        totalCost: 3000,
        status: "active",
      });

      const response = await request
        .put(`/api/financials/plans/${plan._id}`)
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          status: "completed",
          notes: "Plan has been completed",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("completed");

      const updated = await TreatmentPlan.findById(plan._id);
      expect(updated.status).toBe("completed");
      expect(updated.notes).toBe("Plan has been completed");
    });

    test("Doctor can delete a treatment plan", async () => {
      const plan = await TreatmentPlan.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        title: "Plan to Delete",
        totalCost: 1500,
        status: "active",
      });

      const response = await request
        .delete(`/api/financials/plans/${plan._id}`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const deleted = await TreatmentPlan.findById(plan._id);
      expect(deleted).toBeNull();
    });
  });

  describe("Payments", () => {
    let plan;

    beforeEach(async () => {
      plan = await TreatmentPlan.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        title: "Treatment Plan for Payment",
        totalCost: 10000,
        status: "active",
      });
    });

    test("Doctor can record a payment for a treatment plan", async () => {
      const response = await request
        .post("/api/financials/payments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          planId: plan._id.toString(),
          patientId: fixtures.patientA1._id.toString(),
          amountPaid: 2000,
          paymentMethod: "cash",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.amountPaid).toBe(2000);
      expect(response.body.data.paymentMethod).toBe("cash");

      const savedPayment = await Payment.findById(response.body.data._id);
      expect(savedPayment).not.toBeNull();
      expect(savedPayment.planId.toString()).toBe(plan._id.toString());
      expect(savedPayment.receivedByModel).toBe("Doctor");

      // Check that an InAppNotification with type 'PAYMENT_RECORDED' was created
      const notification = await InAppNotification.findOne({
        type: "PAYMENT_RECORDED",
        recipient: fixtures.patientA1._id,
        recipientRole: "patient",
      });
      expect(notification).not.toBeNull();
      expect(notification.category).toBe("payment");
    });

    test("Secretary can record a payment for a treatment plan", async () => {
      const response = await request
        .post("/api/financials/payments")
        .set("Authorization", authHeader(fixtures.secretaryAToken))
        .send({
          planId: plan._id.toString(),
          patientId: fixtures.patientA1._id.toString(),
          amountPaid: 3000,
          paymentMethod: "card",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.amountPaid).toBe(3000);

      const savedPayment = await Payment.findById(response.body.data._id);
      expect(savedPayment.receivedByModel).toBe("Secretary");
    });

    test("Payment amount must be greater than zero", async () => {
      const response = await request
        .post("/api/financials/payments")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          planId: plan._id.toString(),
          patientId: fixtures.patientA1._id.toString(),
          amountPaid: 0,
          paymentMethod: "cash",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("Doctor can list payments for a patient", async () => {
      // Create multiple payments
      await Payment.create({
        planId: plan._id,
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        receivedById: fixtures.doctorA._id,
        receivedByModel: "Doctor",
        amountPaid: 1000,
        paymentMethod: "cash",
      });

      await Payment.create({
        planId: plan._id,
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        receivedById: fixtures.doctorA._id,
        receivedByModel: "Doctor",
        amountPaid: 2000,
        paymentMethod: "card",
      });

      const response = await request
        .get(`/api/financials/patients/${fixtures.patientA1._id}/payments`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    test("Doctor can update a payment record", async () => {
      const payment = await Payment.create({
        planId: plan._id,
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        receivedById: fixtures.doctorA._id,
        receivedByModel: "Doctor",
        amountPaid: 1500,
        paymentMethod: "cash",
      });

      const response = await request
        .put(`/api/financials/payments/${payment._id}`)
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          amountPaid: 2500,
          paymentMethod: "card",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.amountPaid).toBe(2500);

      const updated = await Payment.findById(payment._id);
      expect(updated.amountPaid).toBe(2500);
      expect(updated.paymentMethod).toBe("card");
    });

    test("Doctor can delete a payment record", async () => {
      const payment = await Payment.create({
        planId: plan._id,
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        receivedById: fixtures.doctorA._id,
        receivedByModel: "Doctor",
        amountPaid: 1000,
        paymentMethod: "cash",
      });

      const response = await request
        .delete(`/api/financials/payments/${payment._id}`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const deleted = await Payment.findById(payment._id);
      expect(deleted).toBeNull();
    });
  });

  describe("Financial Summary", () => {
    test("Doctor can get financial summary for a patient", async () => {
      // Create plan and payments
      const plan = await TreatmentPlan.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        title: "Summary Test Plan",
        totalCost: 5000,
        status: "active",
      });

      await Payment.create({
        planId: plan._id,
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        receivedById: fixtures.doctorA._id,
        receivedByModel: "Doctor",
        amountPaid: 2000,
        paymentMethod: "cash",
      });

      const response = await request
        .get(`/api/financials/patients/${fixtures.patientA1._id}/summary`)
        .set("Authorization", authHeader(fixtures.doctorAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.totals).toBeDefined();
      expect(response.body.data.totals.totalCost).toBeGreaterThan(0);
      expect(response.body.data.totals.totalPaid).toBeGreaterThanOrEqual(2000);
      expect(response.body.data.totals.remainingBalance).toBeDefined();
    });

    test("Patient cannot see another patient's financial summary", async () => {
      const response = await request
        .get(`/api/financials/patients/${fixtures.patientA2._id}/summary`)
        .set("Authorization", authHeader(fixtures.patientA1Token));

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test("Doctor cannot see another doctor's patient financial summary", async () => {
      const response = await request
        .get(`/api/financials/patients/${fixtures.patientA1._id}/summary`)
        .set("Authorization", authHeader(fixtures.doctorBToken));

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Tenant Isolation", () => {
    test("Secretary cannot create a plan for a patient from another clinic", async () => {
      const response = await request
        .post("/api/financials/plans")
        .set("Authorization", authHeader(fixtures.secretaryAToken))
        .send({
          patientId: fixtures.patientB1._id.toString(),
          title: "Unauthorized Plan",
          totalCost: 1000,
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test("Secretary can only list plans for their doctor's patients", async () => {
      // Create plans for Doctor A's patient
      await TreatmentPlan.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        title: "Secretary's Plan",
        totalCost: 2000,
      });

      const response = await request
        .get(`/api/financials/patients/${fixtures.patientA1._id}/plans`)
        .set("Authorization", authHeader(fixtures.secretaryAToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("Schema Validation", () => {
    test("Treatment plan totalCost must be a number", async () => {
      const response = await request
        .post("/api/financials/plans")
        .set("Authorization", authHeader(fixtures.doctorAToken))
        .send({
          patientId: fixtures.patientA1._id.toString(),
          title: "Invalid Cost",
          totalCost: "not a number",
        });

      // Response should handle invalid input gracefully
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test("Payment requires valid paymentMethod enum", async () => {
      const plan = await TreatmentPlan.create({
        doctorId: fixtures.doctorA._id,
        patientId: fixtures.patientA1._id,
        title: "Payment Method Test",
        totalCost: 5000,
      });

      try {
        await Payment.create({
          planId: plan._id,
          doctorId: fixtures.doctorA._id,
          patientId: fixtures.patientA1._id,
          receivedById: fixtures.doctorA._id,
          receivedByModel: "Doctor",
          amountPaid: 1000,
          paymentMethod: "invalid_method",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toMatch(/enum|invalid/i);
      }
    });
  });
});
