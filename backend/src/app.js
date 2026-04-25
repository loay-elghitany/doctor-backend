import express from "express";
import cors from "cors";
import helmet from "helmet";
import {
  generalLimiter,
  authLimiter,
  strictPostLimiter,
} from "./middleware/rateLimiter.js";
import patientRoutes from "./routes/patientRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import prescriptionRoutes from "./routes/prescriptionRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import doctorAppointmentRoutes from "./routes/doctorAppointmentRoutes.js";
import doctorTimelineRoutes from "./routes/doctorTimelineRoutes.js";
import appointmentViewRoutes from "./routes/appointmentViewRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminNotificationRoutes from "./routes/adminNotificationRoutes.js";
import patientTimelineRoutes from "./routes/patientTimelineRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import patientTimelineFilteredRoutes from "./routes/patientTimelineFilteredRoutes.js";
import doctorTimelineFilteredRoutes from "./routes/doctorTimelineFilteredRoutes.js";
import notificationPreferencesRoutes from "./routes/notificationPreferencesRoutes.js";
import adminAnalyticsRoutes from "./routes/adminAnalyticsRoutes.js";
import communicationRoutes from "./routes/communicationRoutes.js";
import secretaryRoutes from "./routes/secretaryRoutes.js";
import financialRoutes from "./routes/financialRoutes.js";
import globalErrorHandler from "./middleware/globalErrorHandler.js";
import notFoundHandler from "./middleware/notFoundHandler.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";
const MAIN_DOMAIN = "mydoc90.com";

// ============================================
// CORS CONFIGURATION - Production Hardened
// ============================================

const corsOptions = {
  origin: (origin, callback) => {
    // 1. If Origin is missing (Render Proxy issue), fallback to main domain
    // instead of returning 'true' (which leaks wildcard *)
    if (!origin) {
      console.log("[CORS] Origin missing, allowing main domain fallback");
      return callback(null, `https://${MAIN_DOMAIN}`);
    }

    try {
      const hostName = new URL(origin).hostname.toLowerCase();

      // 2. Allow our main domain and ANY subdomain (loay.mydoc90.com, etc.)
      const isMydoc90 = hostName === MAIN_DOMAIN || hostName.endsWith("." + MAIN_DOMAIN);
      const isLocal = hostName === "localhost" || hostName === "127.0.0.1";

      if (isMydoc90 || isLocal) {
        // IMPORTANT: Reflect the origin string itself, NEVER return 'true'
        callback(null, origin);
      } else {
        console.error(`[CORS Blocked]: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    } catch (err) {
      callback(new Error("Invalid Origin Format"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  exposedHeaders: ["Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// ============================================
// MIDDLEWARE ORDER - CORS MUST BE FIRST
// ============================================

// 1. CORS first - before anything else that might set headers
app.use(cors(corsOptions));

// 2. Helmet after CORS with cross-origin policy
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// 3. Rate limiting
app.use(generalLimiter);
app.use(express.json());

app.use("/api/patients/login", authLimiter);
app.use("/api/doctors/login", authLimiter);
app.use("/api/secretaries/login", authLimiter);

app.use("/api/patients", patientRoutes);
app.use(
  "/api/appointments",
  (req, res, next) =>
    req.method === "POST" ? strictPostLimiter(req, res, next) : next(),
  appointmentRoutes,
);
app.use(
  "/api/prescriptions",
  (req, res, next) =>
    req.method === "POST" ? strictPostLimiter(req, res, next) : next(),
  prescriptionRoutes,
);
app.use("/api/doctors", doctorRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/doctor-appointments", doctorAppointmentRoutes);
app.use("/api/doctor/patients", doctorTimelineRoutes);
app.use("/api/views", appointmentViewRoutes);
app.use("/api/patient", patientTimelineRoutes);
app.use("/api/patient/timeline", patientTimelineFilteredRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/notifications", adminNotificationRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/doctor/timeline", doctorTimelineFilteredRoutes);
app.use("/api/secretaries", secretaryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/notification-preferences", notificationPreferencesRoutes);
app.use("/api/communication", communicationRoutes);
app.use("/api/financials", financialRoutes);

app.get("/", (req, res) => {
  res.send("Clinic SaaS API running");
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
