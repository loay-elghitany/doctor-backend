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

// Custom CORS middleware - guarantees no wildcard * and uses "Reflective Origin" logic
const customCors = (req, res, next) => {
  const requestOrigin = req.headers.origin;
  let allowedOrigin = `https://${MAIN_DOMAIN}`;
  let originSource = "default";

  if (requestOrigin) {
    // Primary: Use the Origin header if valid
    try {
      const host = new URL(requestOrigin).hostname.toLowerCase();
      const isAllowed =
        host === MAIN_DOMAIN ||
        host.endsWith("." + MAIN_DOMAIN) ||
        host === "localhost" ||
        host === "127.0.0.1";
      if (isAllowed) {
        allowedOrigin = requestOrigin;
        originSource = "origin-header";
      }
    } catch (e) {
      console.error("[CORS] Invalid origin:", requestOrigin);
    }
  } else {
    // Fallback 1: Try to get from referer
    const referer = req.headers.referer;
    if (referer) {
      try {
        const refHost = new URL(referer).hostname.toLowerCase();
        if (refHost === MAIN_DOMAIN || refHost.endsWith("." + MAIN_DOMAIN)) {
          allowedOrigin = `https://${refHost}`;
          originSource = "referer";
        }
      } catch (e) {}
    }

    // Fallback 2: Reflective Origin - construct from host and x-forwarded-proto
    // This handles cases where proxy strips the Origin header (e.g., Render)
    if (originSource === "default") {
      const forwardedProto = req.headers["x-forwarded-proto"];
      const host = req.headers.host;
      if (host) {
        const protocol = forwardedProto === "https" ? "https" : "http";
        const inferredOrigin = `${protocol}://${host}`;
        // Validate that the host is a mydoc90.com subdomain or localhost
        const hostLower = host.toLowerCase();
        const hostname = hostLower.split(":")[0]; // Remove port if present
        if (
          hostname === MAIN_DOMAIN ||
          hostname.endsWith("." + MAIN_DOMAIN) ||
          hostname === "localhost" ||
          hostname === "127.0.0.1"
        ) {
          allowedOrigin = inferredOrigin;
          originSource = "reflective";
          console.log(
            "[CORS Success] Origin inferred from host header:",
            allowedOrigin,
          );
        } else {
          console.log(
            "[CORS Warning] Host header not from allowed domain:",
            host,
          );
        }
      }
    }
  }

  // Log the origin detection for debugging
  if (originSource !== "default") {
    console.log(`[CORS] Origin detected (${originSource}):`, allowedOrigin);
  }

  // Set headers explicitly - NEVER use * or true
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,PATCH,OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Requested-With,Accept",
  );
  res.header("Access-Control-Expose-Headers", "Authorization");
  res.header("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
};

// Apply custom CORS first
app.use(customCors);

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
