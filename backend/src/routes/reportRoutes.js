import express from "express";
import { tenantScope } from "../middleware/tenantScope.js";
import { protect } from "../middleware/authMiddleware.js";
import { createReport, getReports } from "../controllers/reportController.js";

const router = express.Router();

// إضافة تقرير
router.post("/", protect, tenantScope, createReport);

// جلب كل التقارير الخاصة بالمريض
router.get("/", protect, tenantScope, getReports);

export default router;
