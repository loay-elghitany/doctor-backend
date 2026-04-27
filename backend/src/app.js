import express from "express";
import cors from "cors";
import helmet from "helmet";
import logger from "./utils/logger.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
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
// CORS CONFIGURATION - PRODUCTION GRADE
// ============================================
const allowedOrigins = isProduction
  ? ["https://mydoc90.com", "https://www.mydoc90.com"]
  : [
      "https://mydoc90.com",
      "https://www.mydoc90.com",
      "http://localhost:5173",
      "http://localhost:3000",
    ];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  // Allow any https://*.mydoc90.com subdomain
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && url.hostname.endsWith(`.${MAIN_DOMAIN}`)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * CORS Configuration - PRODUCTION FIX
 *
 * Rules:
 * 1. Browser requests (with Origin header): Return EXACT origin string
 * 2. Non-browser requests (no Origin header): callback(null, false)
 *    This allows the request but does NOT set CORS headers
 * 3. Rejected origins: callback(error) - triggers error handler
 */
const corsOptions = {
  origin: (origin, callback) => {
    // No origin = server-to-server, curl, Postman - allow but no CORS headers needed
    if (!origin) {
      return callback(null, false);
    }

    // Browser request with Origin header
    if (isAllowedOrigin(origin)) {
      // MUST return exact origin string when credentials: true
      return callback(null, origin);
    }

    logger.warn("CORS", `Origin rejected: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "X-Subdomain",
  ],
  exposedHeaders: ["Authorization"],
  maxAge: 86400, // Preflight cache: 24 hours - eliminates repeated OPTIONS
  preflightContinue: false, // CORS middleware handles OPTIONS, don't pass to next handler
  optionsSuccessStatus: 204, // Use 204 for preflight success (some legacy browsers choke on 200)
};

// ============================================
// CORS MUST BE FIRST MIDDLEWARE
// The cors package handles OPTIONS preflight automatically
// ============================================
app.use(cors(corsOptions));

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: false, // Disabled for API server
  }),
);

// ============================================
// REQUEST DEBUGGING (All environments for CORS troubleshooting)
// ============================================
app.use((req, res, next) => {
  // Log all requests in production to help debug CORS issues
  const origin = req.headers.origin;
  const isCORS = !!origin;

  if (isProduction) {
    // In production, only log CORS-related requests to reduce noise
    if (isCORS || req.method === "OPTIONS") {
      logger.info("CORS-Request", `${req.method} ${req.originalUrl}`, {
        origin: origin || "none",
        host: req.headers.host,
        isCORSEnabled: isAllowedOrigin(origin),
      });
    }
  } else {
    // In development, log all requests
    logger.debug("Request", `${req.method} ${req.originalUrl}`, {
      origin: origin || "none",
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.substring(0, 50),
    });
  }
  next();
});

// ============================================
// GLOBAL RATE LIMITING (after security, before body parser)
// ============================================
// All limiters skip OPTIONS requests automatically
app.use(generalLimiter);

// ============================================
// BODY PARSER (before routes, after CORS/Security)
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// ROUTES (Rate limiting is applied INSIDE route files)
// ============================================
// Note: Rate limiters now skip OPTIONS requests automatically
// See middleware/rateLimiter.js for skip logic

app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/secretaries", secretaryRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
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
app.use("/api/notifications", notificationRoutes);
app.use("/api/notification-preferences", notificationPreferencesRoutes);
app.use("/api/communication", communicationRoutes);
app.use("/api/financials", financialRoutes);

// ============================================
// HEALTH CHECK (No auth, no rate limit complications)
// ============================================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Clinic SaaS API running",
    timestamp: new Date().toISOString(),
    env: isProduction ? "production" : "development",
  });
});

// Health check endpoint for monitoring
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// CORS test endpoint
app.get("/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working correctly",
    origin: req.headers.origin || "no-origin",
    headers: {
      authorization: req.headers.authorization ? "present" : "missing",
      contentType: req.headers["content-type"] || "not-set",
    },
  });
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
