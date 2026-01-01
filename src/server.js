import "dotenv/config";
import app from "./app.js";
import env from "./config/env.js";
import { cleanupExpiredTokens } from "./utils/tokenService.js";

const PORT = env.PORT || 3001;

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Mobile access: http://YOUR_IP:${PORT}`);
  console.log(`🌍 Environment: ${env.NODE_ENV}`);
});

// Cleanup expired tokens every hour
const tokenCleanupInterval = setInterval(async () => {
  try {
    await cleanupExpiredTokens();
    console.log("✅ Token cleanup completed");
  } catch (err) {
    console.error("❌ Token cleanup error:", err);
  }
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  clearInterval(tokenCleanupInterval);

  server.close((err) => {
    if (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
    console.log("Server closed. Goodbye! 👋");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
