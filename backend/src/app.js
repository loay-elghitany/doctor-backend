import express from "express";
import cors from "cors";
import helmet from "helmet";
import logger from "./utils/logger.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import patientRoutes from "./routes/patientRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import prescriptionRoutes from "./routes/prescriptionRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import doctorCredentialRoutes from "./routes/doctorCredentialRoutes.js";
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

// ============================================
// RENDER PROXY CONFIGURATION
// ============================================
// Trust proxy - required for Render.com behind reverse proxy
// This ensures req.ip and secure cookies work correctly
app.set("trust proxy", 1);
app.disable("x-powered-by");

// ============================================
// COOKIE SECURITY (if you use cookies)
// ============================================
// Example cookie configuration for cross-subdomain SaaS:
// res.cookie('token', value, {
//   secure: true,        // HTTPS only (required for Render)
//   sameSite: 'none',    // Cross-site/subdomain access
//   httpOnly: true,      // Prevent XSS
//   maxAge: 24 * 60 * 60 * 1000  // 24 hours
// });

const isProduction = process.env.NODE_ENV === "production";
const MAIN_DOMAIN = "mydoc90.com";

// ============================================
// CORS CONFIGURATION - FINAL
// ============================================

// 1. تعريف القائمة أولاً
const allowedOrigins = isProduction
  ? [`https://${MAIN_DOMAIN}`, `https://www.${MAIN_DOMAIN}`]
  : [
      `https://${MAIN_DOMAIN}`,
      `https://www.${MAIN_DOMAIN}`,
      "http://localhost:5173",
      "http://localhost:3000",
    ];

// 2. دالة الفحص (وبداخلها استثناء الـ Localhost)
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);

    // تصريح المرور لبيئة التطوير
    if (!isProduction) {
      if (url.protocol === "http:" && url.hostname.endsWith(".localhost")) {
        return true;
      }
    }

    // حماية بيئة الإنتاج
    if (
      url.protocol === "https:" &&
      url.hostname.endsWith(`.${MAIN_DOMAIN}`) &&
      url.hostname !== MAIN_DOMAIN &&
      url.hostname !== `www.${MAIN_DOMAIN}`
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// 3. إعدادات مكتبة CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, false);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, origin); // إرجاع الدومين الفعلي لمنع خطأ النجمة *
    }

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
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 200,
};

// 4. تفعيل الـ CORS
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
// VERCEL EDGE NETWORK COMPATIBILITY
// ============================================
app.use((req, res, next) => {
  // Add headers for Vercel Edge Network and CDN compatibility
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // CORS headers are set by cors() middleware, but ensure Vary: Origin for CDNs
  // This tells CDNs to cache responses separately per origin
  if (req.headers.origin) {
    res.setHeader("Vary", "Origin");
  }

  next();
});

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
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/doctor", doctorCredentialRoutes);
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
