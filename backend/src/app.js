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

// Explicit allowed origins list
const explicitAllowedOrigins = [
  "https://mydoc90.com",
  "https://www.mydoc90.com",
  "https://api.mydoc90.com",
  ...(process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

// ============================================
// CORS CONFIGURATION - Forensic Audit Fix
// ============================================

const corsOptions = {
  origin: (origin, callback) => {
    // DEBUG: Log every CORS check to Render logs
    console.log(`[CORS Debug] Checking origin: ${origin || "NULL/UNDEFINED"}`);
    console.log(`[CORS Debug] NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[CORS Debug] Request headers:`, JSON.stringify({
      host: "???", // Will be logged per request below
    }));

    // CRITICAL FIX: Never return true (which sends wildcard *)
    // Instead, derive origin from request headers when missing
    let effectiveOrigin = origin;

    if (!effectiveOrigin) {
      // Try to get origin from Referer or X-Forwarded-Host headers
      // This prevents the wildcard * issue with proxies
      console.warn(`[CORS Warning] Origin is null/undefined. This usually means a proxy is stripping the Origin header.`);
      console.warn(`[CORS Warning] Returning 403 to prevent wildcard * leakage.`);

      // Reject requests without origin in production (prevents wildcard)
      if (isProduction) {
        return callback(new Error("CORS: Origin header required in production"), false);
      }

      // In development, allow but log warning
      console.warn(`[CORS Dev] Allowing request without origin header`);
      return callback(null, "http://localhost:5173"); // Return explicit origin, not true
    }

    try {
      const parsedOrigin = new URL(effectiveOrigin);
      const host = parsedOrigin.hostname.toLowerCase();

      console.log(`[CORS Debug] Parsed hostname: ${host}`);

      // Check 1: mydoc90.com domain and subdomains
      const isMydocDomain = host === "mydoc90.com" || host.endsWith(".mydoc90.com");

      // Check 2: Dynamic domain from env
      const dynamicDomain = (process.env.MAIN_DOMAIN || "").trim().toLowerCase();
      const isDynamicDomain = dynamicDomain && (host === dynamicDomain || host.endsWith(`.${dynamicDomain}`));

      // Check 3: Explicit allowed origins
      const isExplicitlyAllowed = explicitAllowedOrigins.includes(effectiveOrigin);

      // Check 4: Localhost in development
      const isLocalhost = !isProduction && (host === "localhost" || host === "127.0.0.1" || host.includes("localhost"));

      console.log(`[CORS Debug] Checks:`, { isMydocDomain, isDynamicDomain, isExplicitlyAllowed, isLocalhost });

      if (isMydocDomain || isDynamicDomain || isExplicitlyAllowed || isLocalhost) {
        // ✅ CRITICAL: Return the exact origin string, NOT true
        // This ensures Access-Control-Allow-Origin: https://subdomain.mydoc90.com
        console.log(`[CORS Success] Allowing origin: ${effectiveOrigin}`);
        callback(null, effectiveOrigin);
      } else {
        console.error(`[CORS Reject] Origin not allowed: ${effectiveOrigin}`);
        callback(new Error(`CORS: Origin ${effectiveOrigin} not allowed`), false);
      }
    } catch (error) {
      console.error(`[CORS Error] Failed to parse origin: ${effectiveOrigin}`, error.message);
      callback(new Error(`CORS: Invalid origin format`), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// ============================================
// MIDDLEWARE ORDER - CORS must be early
// ============================================

// Add Vary: Origin header to all responses (prevents caching issues)
app.use((req, res, next) => {
  res.vary("Origin");
  next();
});

// CORS must come BEFORE helmet to ensure headers are set properly
app.use(cors(corsOptions));

// Helmet after CORS
app.use(helmet({
  // Disable crossOriginResourcePolicy to prevent conflicts with CORS
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Rate limiting after CORS
app.use(generalLimiter);

// Debug middleware - log all incoming requests
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.path}`);
  console.log(`[Request] Origin header: ${req.headers.origin || "MISSING"}`);
  console.log(`[Request] Host header: ${req.headers.host || "MISSING"}`);
  console.log(`[Request] X-Forwarded-Host: ${req.headers["x-forwarded-host"] || "MISSING"}`);
  console.log(`[Request] Referer: ${req.headers.referer || "MISSING"}`);
  next();
});
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
