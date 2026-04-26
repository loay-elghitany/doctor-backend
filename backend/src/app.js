import express from "express";
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

// Production CORS Middleware - STRICT MODE
// NEVER returns wildcard (*) - only sets headers for valid Origin requests
const strictCors = (req, res, next) => {
  const requestOrigin = req.headers.origin;

  // If no Origin header, skip CORS entirely (not a cross-origin request)
  if (!requestOrigin) {
    console.log(
      "[CORS] No Origin header - skipping CORS for:",
      req.method,
      req.originalUrl,
    );
    return next();
  }

  // Parse and validate origin
  let isValidOrigin = false;
  let normalizedOrigin = requestOrigin;

  try {
    const url = new URL(requestOrigin);
    const hostname = url.hostname.toLowerCase();
    const protocol = url.protocol;

    // Check if origin is allowed
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isMydocDomain =
      hostname === MAIN_DOMAIN || hostname.endsWith("." + MAIN_DOMAIN);

    if (isMydocDomain || isLocalhost) {
      isValidOrigin = true;
      // Normalize to HTTPS for mydoc90.com domains
      if (isMydocDomain && protocol === "http:") {
        normalizedOrigin = `https://${hostname}`;
      } else {
        normalizedOrigin = requestOrigin;
      }
    }
  } catch (e) {
    console.error("[CORS] Invalid Origin format:", requestOrigin);
  }

  // Reject invalid origins
  if (!isValidOrigin) {
    console.warn("[CORS] Rejected origin:", requestOrigin);
    return res.status(403).json({
      error: "CORS Error",
      message: "Origin not allowed",
      origin: requestOrigin,
    });
  }

  // Set CORS headers (NEVER use *)
  res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, X-Subdomain",
  );
  res.setHeader("Access-Control-Expose-Headers", "Authorization");
  res.setHeader("Vary", "Origin");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  console.log("[CORS] Allowed origin:", normalizedOrigin);
  next();
};

// Apply strict CORS as first middleware
app.use(strictCors);

// Helmet after CORS
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Rate limiting
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
