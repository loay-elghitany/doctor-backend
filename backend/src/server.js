import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

// Import all application routes
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
import medicalFileRoutes from "./routes/medicalFileRoutes.js";
import patientTimelineFilteredRoutes from "./routes/patientTimelineFilteredRoutes.js";
import doctorTimelineFilteredRoutes from "./routes/doctorTimelineFilteredRoutes.js";
import notificationPreferencesRoutes from "./routes/notificationPreferencesRoutes.js";
import adminAnalyticsRoutes from "./routes/adminAnalyticsRoutes.js";

// --- Initialization ---
// Load environment variables from .env file
dotenv.config();
// Establish database connection
connectDB();

const app = express();


// --- Core Middleware ---

// 1. Production-Ready CORS Configuration
// This setup restricts API access to only your Vercel frontend.
const corsOptions = {
  origin: "https://doctor-frontend-bay.vercel.app",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
  optionsSuccessStatus: 200 // Ensures legacy browsers (and some modern ones) don't fail on preflight OPTIONS requests
};

// The cors middleware automatically handles preflight (OPTIONS) requests.
// Placing it before all routes ensures that CORS headers are set correctly for all responses.
app.use(cors(corsOptions));

// 2. JSON Body Parser
// This middleware is required to parse JSON-formatted request bodies.
app.use(express.json());


// --- API Routes ---
// All API endpoints are modularly structured and registered here.
app.use("/api/patients", patientRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/doctor/appointments", doctorAppointmentRoutes);
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
app.use("/api/medical-files", medicalFileRoutes);


// --- Health Check Route ---
// A simple endpoint to verify that the service is running.
app.get("/", (req, res) => {
  res.send("Clinic SaaS API is running and healthy.");
});


// --- Global Error Handlers (Stability Safeguards) ---
// Catches unhandled promise rejections from async operations.
process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
  // Recommended: Use a process manager like PM2 to automatically restart the service.
});

// Catches exceptions not handled in any try-catch block.
process.on("uncaughtException", (error) => {
  console.error("CRITICAL: Uncaught Exception:", error);
  // It is mandatory to exit after an uncaught exception to avoid an unstable state.
  process.exit(1);
});


// --- Server Activation ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
