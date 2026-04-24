import express from "express";
import { universalAuth } from "../middleware/universalAuth.js";
import { enforceTenant } from "../middleware/enforceTenant.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
import {
  createTreatmentPlan,
  listTreatmentPlansByPatient,
  updateTreatmentPlan,
  deleteTreatmentPlan,
  createPayment,
  listPaymentsByPatient,
  updatePayment,
  deletePayment,
  getPatientFinancialSummary,
} from "../controllers/financialController.js";

const router = express.Router();

router.use(universalAuth, enforceTenant);

router.post("/plans", requireRole(ROLES.DOCTOR), createTreatmentPlan);
router.get(
  "/patients/:patientId/plans",
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY, ROLES.PATIENT),
  listTreatmentPlansByPatient,
);
router.put("/plans/:planId", requireRole(ROLES.DOCTOR), updateTreatmentPlan);
router.delete("/plans/:planId", requireRole(ROLES.DOCTOR), deleteTreatmentPlan);

router.post("/payments", requireRole(ROLES.DOCTOR, ROLES.SECRETARY), createPayment);
router.get(
  "/patients/:patientId/payments",
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY, ROLES.PATIENT),
  listPaymentsByPatient,
);
router.put("/payments/:paymentId", requireRole(ROLES.DOCTOR), updatePayment);
router.delete("/payments/:paymentId", requireRole(ROLES.DOCTOR), deletePayment);

router.get(
  "/patients/:patientId/summary",
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY, ROLES.PATIENT),
  getPatientFinancialSummary,
);
router.get(
  "/my-summary",
  requireRole(ROLES.PATIENT),
  getPatientFinancialSummary,
);

export default router;
