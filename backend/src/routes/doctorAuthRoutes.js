import express from "express";
import { protectDoctor as protect } from "../middleware/doctorAuthMiddleware.js";
import { updateDoctorCredentials } from "../controllers/doctorAuthController.js";

const router = express.Router();

router.put("/update-credentials", protect, updateDoctorCredentials);

export default router;
