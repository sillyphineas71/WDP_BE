import express from "express";
import "dotenv/config";
import sequelize from "./src/config/database.js";
import { initModels } from "./src/models/index.js";
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import adminCollectiveRoutes from "./src/routes/adminCollectiveRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import teacherRoutes from "./src/routes/teacherRoutes.js";
import studentRoutes from "./src/routes/studentRoutes.js";
import uploadRoutes from "./src/routes/uploadRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { closeRedisConnection, isRedisConfigured } from "./src/config/redis.js";
import { isMailerConfigured } from "./src/config/mailer.js";
import { isFirebaseConfigured } from "./src/config/firebase.js";
import {
  startNotificationWorker,
  stopNotificationWorker,
} from "./src/services/notificationWorkerService.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

async function initializeDatabase() {
  try {
    initModels(sequelize);
    await sequelize.authenticate();
    console.log("Database connection established");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    console.warn("Server will start without database connection");
  }
}

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/v1/admin", adminCollectiveRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Smart Edu LMS API is running",
    services: {
      redis_configured: isRedisConfigured(),
      mailer_configured: isMailerConfigured(),
      firebase_configured: isFirebaseConfigured(),
    },
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    status: 404,
  });
});

app.use(errorHandler);

async function startServer() {
  await initializeDatabase();

  if (process.env.START_NOTIFICATION_WORKER !== "false") {
    startNotificationWorker();
  }

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Base URL: http://localhost:${PORT}`);
    console.log(`Health Check: http://localhost:${PORT}/api/health`);
  });

  const shutdown = async () => {
    await stopNotificationWorker();
    await closeRedisConnection();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();

export default app;
