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

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }

    try {
      const parsedOrigin = new URL(origin);
      const hostName = parsedOrigin.hostname.toLowerCase();

      // Check 1: Subdomain of mydoc90.com (e.g., loay.mydoc90.com)
      const isMydoc90Subdomain = hostName.endsWith(".mydoc90.com");
      const isMydoc90Main = hostName === "mydoc90.com" || hostName === "www.mydoc90.com";

      // Check 2: Dynamic root domain from env
      const dynamicRootDomain = (process.env.MAIN_DOMAIN || "").trim().toLowerCase();
      const isDynamicSubdomain = dynamicRootDomain && hostName.endsWith(`.${dynamicRootDomain}`);
      const isDynamicMain = dynamicRootDomain && hostName === dynamicRootDomain;

      // Check 3: Localhost in development
      const isLocalhost =
        !isProduction &&
        (hostName === "localhost" ||
          hostName.includes("localhost") ||
          hostName === "127.0.0.1");

      // Check 4: Explicitly allowed origins
      const isExplicitlyAllowed = explicitAllowedOrigins.includes(origin);

      if (isMydoc90Subdomain || isMydoc90Main || isDynamicSubdomain || isDynamicMain || isLocalhost || isExplicitlyAllowed) {
        // Reflect the exact origin back (required for credentials)
        callback(null, origin);
        return;
      }

      // Log rejected origins for debugging
      console.warn(`CORS rejected origin: ${origin} (hostname: ${hostName})`);
      callback(new Error("Not allowed by CORS"));
    } catch (error) {
      console.error(`CORS error parsing origin: ${origin}`, error.message);
      callback(new Error("Invalid origin format"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  exposedHeaders: ["Authorization"],
};

app.use(helmet());
app.use(cors(corsOptions));
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
