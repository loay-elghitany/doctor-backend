import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
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

dotenv.config();
connectDB();

const app = express();
// Enforce strict CORS policy for production
const corsOptions = {
  origin: "https://doctor-frontend-bay.vercel.app",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
};

// Handle preflight requests before all other routes
app.options("*", cors(corsOptions));

// Apply main CORS middleware
app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/patients", patientRoutes);

app.use("/api/appointments", appointmentRoutes);

app.use("/api/prescriptions", prescriptionRoutes);

app.use("/api/doctors", doctorRoutes);

app.use("/api/reports", reportRoutes);

app.use("/api/doctor/appointments", doctorAppointmentRoutes);

// Doctor timeline - view patient medical history + add notes
app.use("/api/doctor/patients", doctorTimelineRoutes);

app.use("/api/views", appointmentViewRoutes);

// Patient timeline - aggregated medical history
app.use("/api/patient", patientTimelineRoutes);

// Enhanced patient timeline with filtering and pagination
app.use("/api/patient/timeline", patientTimelineFilteredRoutes);

// Admin routes for manual subscription management
app.use("/api/admin", adminRoutes);

// Admin notification monitoring routes
app.use("/api/admin/notifications", adminNotificationRoutes);

// Admin analytics and reporting
app.use("/api/admin/analytics", adminAnalyticsRoutes);

// Enhanced doctor timeline with filtering and search
app.use("/api/doctor/timeline", doctorTimelineFilteredRoutes);

// Notification routes for patients and doctors
app.use("/api/notifications", notificationRoutes);

// Notification preferences for patients and doctors
app.use("/api/notification-preferences", notificationPreferencesRoutes);

// Medical files upload/download routes
app.use("/api/medical-files", medicalFileRoutes);

app.get("/", (req, res) => {
  res.send("Clinic SaaS API running");
});

// Global process-level error handlers (stability safeguard)
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Exit with failure to avoid undefined process state
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
