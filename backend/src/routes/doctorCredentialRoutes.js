import express from "express";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
import { updateDoctorCredentials } from "../controllers/doctorController.js";

const router = express.Router();

router.put(
  "/update-credentials",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  updateDoctorCredentials,
);

export default router;
