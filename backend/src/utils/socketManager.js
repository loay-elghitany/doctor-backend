import { Server } from "socket.io";
import logger from "./logger.js";

let io = null;

const isProduction = process.env.NODE_ENV === "production";
const MAIN_DOMAIN = process.env.MAIN_DOMAIN || "mydoc90.com";

/**
 * Socket.io Manager for Multi-Tenant Medical SaaS
 * Handles real-time notifications for Doctors, Secretaries, and Patients
 */

// Initialize Socket.io with Express HTTP server
export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // 1. Allow requests with no origin (mobile apps, server-to-server)
        if (!origin) {
          return callback(null, true);
        }

        // 2. Local Development: Allow localhost and any subdomain
        if (!isProduction) {
          if (
            origin.includes("localhost") ||
            origin.includes("127.0.0.1") ||
            origin.startsWith("http://localhost:") ||
            origin.startsWith("https://localhost:")
          ) {
            return callback(null, origin);
          }
        }

        // 3. Production: Allow main domain and all subdomains
        try {
          const url = new URL(origin);
          const hostname = url.hostname;

          if (
            hostname === MAIN_DOMAIN ||
            hostname === `www.${MAIN_DOMAIN}` ||
            hostname.endsWith(`.${MAIN_DOMAIN}`)
          ) {
            return callback(null, origin);
          }
        } catch (err) {
          logger.error("Socket", "Invalid origin URL", {
            origin,
            error: err.message,
          });
        }

        logger.warn("Socket", `Origin rejected: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["polling", "websocket"], // Start with polling for better compatibility
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    logger.info("Socket", `Client connected: ${socket.id}`);

    // Handle user authentication and room joining
    socket.on("authenticate", (data) => {
      const { userId, role, clinicSlug, patientId } = data;

      console.log("[Socket:Server] ============================================");
      console.log("[Socket:Server] AUTHENTICATE EVENT RECEIVED");
      console.log("[Socket:Server] - userId:", userId);
      console.log("[Socket:Server] - role:", role);
      console.log("[Socket:Server] - clinicSlug (from client):", clinicSlug);
      console.log("[Socket:Server] - patientId:", patientId);

      if (!userId || !role) {
        console.error("[Socket:Server] Auth failed: Missing userId or role");
        socket.emit("auth_error", { message: "Missing authentication data" });
        return;
      }

      // Store user info in socket for later use
      socket.userData = { userId, role, clinicSlug, patientId };

      // Join rooms based on role
      switch (role) {
        case "doctor":
        case "secretary":
          // Staff members join clinic-specific room
          if (clinicSlug) {
            const staffRoom = `clinic_${clinicSlug}_staff`;
            console.log(`[Socket:Server] 👤 ${role.toUpperCase()} joining staff room:`);
            console.log(`[Socket:Server] - Role: ${role}`);
            console.log(`[Socket:Server] - clinicSlug received: ${clinicSlug}`);
            console.log(`[Socket:Server] - COMPUTED ROOM NAME: ${staffRoom}`);
            socket.join(staffRoom);
            console.log(`[Socket:Server] ✅ ${role.toUpperCase()} ${userId} JOINED room: ${staffRoom}`);

            // List all rooms this socket is in
            const socketRooms = Array.from(socket.rooms);
            console.log(`[Socket:Server] Socket ${socket.id} is now in rooms:`, socketRooms);

            logger.debug("Socket", `User ${userId} joined ${staffRoom}`);
            socket.emit("joined_room", { room: staffRoom, role });
          } else {
            console.warn(`[Socket:Server] ⚠️ ${role.toUpperCase()} ${userId} has no clinicSlug! Cannot join staff room.`);
            console.warn(`[Socket:Server] - This is likely because the secretary's profile doesn't include clinicSlug.`);
            console.warn(`[Socket:Server] - Check that secretary profile includes clinicSlug from associated doctor.`);
          }
          break;

        case "patient":
          // Patients join their private room by patientId
          if (patientId) {
            const patientRoom = `patient_${patientId}`;
            console.log(`[Socket:Server] Joining patient room: ${patientRoom}`);
            socket.join(patientRoom);
            console.log(`[Socket:Server] Patient ${patientId} joined room ${patientRoom}`);
            logger.debug("Socket", `Patient ${patientId} joined private room`);
            socket.emit("joined_room", { room: patientRoom, role });
          } else {
            console.warn(`[Socket:Server] Patient ${userId} has no patientId!`);
          }
          break;

        default:
          console.error(`[Socket:Server] Invalid role: ${role}`);
          socket.emit("auth_error", { message: "Invalid role" });
          return;
      }

      console.log(`[Socket:Server] User ${userId} authenticated successfully as ${role}`);
      socket.emit("authenticated", { success: true, role });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      logger.info("Socket", `Client disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on("error", (error) => {
      logger.error("Socket", `Socket error for ${socket.id}`, error);
    });
  });

  logger.info("Socket", "Socket.io initialized successfully");
  return io;
};

// Get io instance (for use in controllers)
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized. Call initializeSocket first.");
  }
  return io;
};

// Event Emitters for different notification types

/**
 * Generic notification emitter for staff (doctor + secretary)
 * Emits to clinic_X_staff room
 */
export const emitNotificationToStaff = (clinicSlug, notification) => {
  if (!io) {
    console.error("[Socket:Manager] ERROR: io is null in emitNotificationToStaff");
    return;
  }

  const room = `clinic_${clinicSlug}_staff`;
  const roomClients = io.sockets.adapter.rooms.get(room);
  const clientCount = roomClients ? roomClients.size : 0;

  console.log(`[Socket:Manager] Emitting to staff room ${room} (${clientCount} clients):`, notification.title);

  io.to(room).emit("notification", {
    ...notification,
    timestamp: notification.timestamp || new Date().toISOString(),
  });
};

/**
 * Generic notification emitter for patient
 * Emits to patient_X room
 */
export const emitNotificationToPatient = (patientId, notification) => {
  if (!io) {
    console.error("[Socket:Manager] ERROR: io is null in emitNotificationToPatient");
    return;
  }

  const room = `patient_${patientId}`;
  const roomClients = io.sockets.adapter.rooms.get(room);
  const clientCount = roomClients ? roomClients.size : 0;

  console.log(`[Socket:Manager] Emitting to patient room ${room} (${clientCount} clients):`, notification.title);

  io.to(room).emit("notification", {
    ...notification,
    timestamp: notification.timestamp || new Date().toISOString(),
  });
};

/**
 * Event A: New Patient Registration
 * Emits to clinic staff room
 */
export const emitNewPatientRegistered = (clinicSlug) => {
  if (!io) return;

  const room = `clinic_${clinicSlug}_staff`;
  io.to(room).emit("notification", {
    type: "NEW_PATIENT",
    title: "مريض جديد",
    message: "تم تسجيل مريض جديد",
    timestamp: new Date().toISOString(),
  });

  logger.debug("Socket", `New patient notification emitted to ${room}`);
};

/**
 * Event B: New Appointment Booking - Staff Notification
 * Emits to clinic staff room with patient details
 */
export const emitNewAppointmentToStaff = (
  clinicSlug,
  patientName,
  appointmentDate,
) => {
  if (!io) {
    console.error("[Socket:Manager] ERROR: io is null, Socket.io not initialized!");
    return;
  }

  const room = `clinic_${clinicSlug}_staff`;
  console.log("[Socket:Manager] ============================================");
  console.log("[Socket:Manager] EMIT APPOINTMENT TO STAFF");
  console.log("[Socket:Manager] - Input clinicSlug:", clinicSlug);
  console.log("[Socket:Manager] - COMPUTED TARGET ROOM:", room);
  console.log("[Socket:Manager] - patientName:", patientName);
  console.log("[Socket:Manager] - appointmentDate:", appointmentDate);

  // Check how many clients are in the room
  const roomClients = io.sockets.adapter.rooms.get(room);
  const clientCount = roomClients ? roomClients.size : 0;
  console.log(`[Socket:Manager] - CLIENTS IN TARGET ROOM '${room}':`, clientCount);

  // List all available rooms for debugging
  const allRooms = Array.from(io.sockets.adapter.rooms.keys());
  const staffRooms = allRooms.filter(r => r.includes('clinic_'));
  console.log("[Socket:Manager] - ALL STAFF ROOMS EXISTING:", staffRooms);

  if (clientCount === 0) {
    console.warn(`[Socket:Manager] ⚠️ WARNING: No clients in room ${room}! Message will be lost.`);
    console.warn(`[Socket:Manager] - Available staff rooms:`, staffRooms);
  }

  io.to(room).emit("notification", {
    type: "NEW_APPOINTMENT_STAFF",
    title: "حجز موعد جديد",
    message: `المريض ${patientName} يريد حجز موعد يوم ${appointmentDate}`,
    timestamp: new Date().toISOString(),
    data: { patientName, appointmentDate },
  });

  console.log(`[Socket:Manager] ✅ Event 'notification' EMITTED to room ${room}`);
  console.log("[Socket:Manager] ============================================");
  logger.debug(
    "Socket",
    `Appointment notification emitted to staff room ${room}`,
  );
};

/**
 * Event B: New Appointment Booking - Patient Confirmation
 * Emits to patient's private room
 */
export const emitAppointmentConfirmationToPatient = (patientId) => {
  if (!io) {
    console.error("[Socket:Manager] ERROR: io is null, Socket.io not initialized!");
    return;
  }

  const room = `patient_${patientId}`;
  console.log("[Socket:Manager] emitAppointmentConfirmationToPatient called:");
  console.log("[Socket:Manager] - patientId:", patientId);
  console.log("[Socket:Manager] - Computed room:", room);

  const roomClients = io.sockets.adapter.rooms.get(room);
  const clientCount = roomClients ? roomClients.size : 0;
  console.log(`[Socket:Manager] - Clients in room ${room}:`, clientCount);

  io.to(room).emit("notification", {
    type: "APPOINTMENT_CONFIRMED",
    title: "تأكيد الحجز",
    message: "تم حجز الموعد بنجاح، الدكتور في انتظارك",
    timestamp: new Date().toISOString(),
  });

  console.log(`[Socket:Manager] Event 'notification' emitted to room ${room}`);
  logger.debug(
    "Socket",
    `Appointment confirmation emitted to patient ${patientId}`,
  );
};

/**
 * Generic notification emitter (for extensibility)
 */
export const emitNotification = (room, notification) => {
  if (!io) return;

  io.to(room).emit("notification", {
    ...notification,
    timestamp: new Date().toISOString(),
  });
};

export default {
  initializeSocket,
  getIO,
  emitNewPatientRegistered,
  emitNewAppointmentToStaff,
  emitAppointmentConfirmationToPatient,
};
