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

// DEBUG: Log all response headers before sending
const logResponseHeaders = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function (body) {
    const headers = res.getHeaders();
    console.log(
      "[CORS DEBUG] Response headers before send:",
      JSON.stringify(headers, null, 2),
    );
    console.log(
      `[CORS DEBUG] ${req.method} ${req.originalUrl} - ACAO:`,
      headers["access-control-allow-origin"],
    );
    return originalSend.call(this, body);
  };

  res.json = function (body) {
    const headers = res.getHeaders();
    console.log(
      "[CORS DEBUG] Response headers before json:",
      JSON.stringify(headers, null, 2),
    );
    console.log(
      `[CORS DEBUG] ${req.method} ${req.originalUrl} - ACAO:`,
      headers["access-control-allow-origin"],
    );
    return originalJson.call(this, body);
  };

  next();
};

app.use(logResponseHeaders);

// Custom CORS middleware - guarantees no wildcard * and uses "Reflective Origin" logic
const customCors = (req, res, next) => {
  const requestOrigin = req.headers.origin;
  // Default fallback - always HTTPS for production
  let allowedOrigin = `https://www.${MAIN_DOMAIN}`;
  let originSource = "default";

  if (requestOrigin) {
    // Primary: Use the Origin header if valid
    try {
      const url = new URL(requestOrigin);
      const host = url.hostname.toLowerCase();
      const protocol = url.protocol;
      // Ensure HTTPS for production origins
      const isLocalhost = host === "localhost" || host === "127.0.0.1";
      const isMydocDomain =
        host === MAIN_DOMAIN || host.endsWith("." + MAIN_DOMAIN);

      if (isMydocDomain || isLocalhost) {
        // Force HTTPS for mydoc90.com domains
        if (isMydocDomain && protocol === "http:") {
          allowedOrigin = `https://${host}`;
        } else {
          allowedOrigin = requestOrigin;
        }
        originSource = "origin-header";
      }
    } catch (e) {
      console.error("[CORS] Invalid origin:", requestOrigin);
    }
  } else {
    // Fallback 1: Try to get from referer - this is the MOST RELIABLE for subdomain detection
    const referer = req.headers.referer;
    if (referer) {
      try {
        const url = new URL(referer);
        const host = url.hostname.toLowerCase();
        const isMydocDomain =
          host === MAIN_DOMAIN || host.endsWith("." + MAIN_DOMAIN);
        const isLocalhost = host === "localhost" || host === "127.0.0.1";

        if (isMydocDomain || isLocalhost) {
          // Always use HTTPS for mydoc90.com domains
          if (isMydocDomain) {
            allowedOrigin = `https://${host}`;
          } else {
            allowedOrigin = `${url.protocol}//${host}`;
          }
          originSource = "referer";
        }
      } catch (e) {
        console.error("[CORS] Invalid referer:", referer);
      }
    }

    // Fallback 2: Use hardcoded production origin (NOT req.headers.host which is the API host)
    // This handles cases where proxy strips both Origin and Referer headers
    if (originSource === "default") {
      // NEVER use req.headers.host here - that's the API server's host (api.mydoc90.com)
      // Instead, use the known frontend URL
      allowedOrigin = `https://www.${MAIN_DOMAIN}`;
      originSource = "hardcoded-fallback";
      console.log(
        "[CORS] Using hardcoded fallback origin (no Origin/Referer):",
        allowedOrigin,
      );
    }
  }

  // Log the origin detection for debugging
  console.log(`[CORS] Origin determined (${originSource}):`, allowedOrigin);

  // Set headers explicitly - NEVER use * or true
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,PATCH,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Requested-With,Accept",
  );
  res.setHeader("Access-Control-Expose-Headers", "Authorization");
  res.setHeader("Vary", "Origin");

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
