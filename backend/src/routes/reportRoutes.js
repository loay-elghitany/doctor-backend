import express from "express";
import { tenantScope } from "../middleware/tenantScope.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
import { createReport, getReports } from "../controllers/reportController.js";

const router = express.Router();

// إضافة تقرير
router.post(
  "/",
  universalAuth,
  requireRole(ROLES.PATIENT),
  tenantScope,
  createReport,
);

// جلب كل التقارير الخاصة بالمريض
router.get(
  "/",
  universalAuth,
  requireRole(ROLES.PATIENT),
  tenantScope,
  getReports,
);

export default router;
