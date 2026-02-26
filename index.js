import express from "express";
import "dotenv/config";
import sequelize from "./src/config/database.js";
import { initModels } from "./src/models/index.js";
import authRoutes from "./src/routes/authRoutes.js";
import adminCollectiveRoutes from "./src/routes/adminCollectiveRoutes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
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
  } else {
    next();
  }
});

// Initialize database and models
async function initializeDatabase() {
  try {
    initModels(sequelize);
    await sequelize.authenticate();
    console.log("✓ Database connection established");
  } catch (error) {
    console.error("✗ Database connection failed:", error.message);
    console.warn("⚠️  Server will start without database connection");
  }
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/v1/admin", adminCollectiveRoutes);
// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Smart Edu LMS API is running" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    status: 404,
  });
});

// Error handling middleware
app.use(errorHandler);

// Initialize and start server
async function startServer() {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health\n`);
  });
}

startServer();

export default app;
