import { Router } from "express";
import {
  getBikes,
  getBikeById,
  createBike,
  updateBike,
  updateBikeStatus,
  getBikeAvailability,
  toggleBikeMaintenance,
  deleteBike,
  addMaintenanceLog,
  addBikeDocument,
  getExpiringDocuments,
} from "../controllers/bikes.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(authenticate);

// GET /api/bikes - List bikes with optional filters
// Query params: status, search, page, limit
router.get("/", getBikes);

// GET /api/bikes/documents/expiring - Get documents expiring soon
// Query params: days (default: 30)
router.get("/documents/expiring", getExpiringDocuments);

// GET /api/bikes/:id - Get single bike by ID
router.get("/:id", getBikeById);

// POST /api/bikes - Create new bike
router.post("/", createBike);

// PUT /api/bikes/:id - Update bike
router.put("/:id", updateBike);

// PATCH /api/bikes/:id/status - Update bike status only
router.patch("/:id/status", updateBikeStatus);

// GET /api/bikes/:id/availability - Get bike availability info
router.get("/:id/availability", getBikeAvailability);

// PATCH /api/bikes/:id/maintenance - Toggle maintenance mode
router.patch("/:id/maintenance", toggleBikeMaintenance);

// POST /api/bikes/:id/maintenance-log - Add maintenance log entry
router.post("/:id/maintenance-log", addMaintenanceLog);

// POST /api/bikes/:id/documents - Add document (RC, Insurance, etc.)
router.post("/:id/documents", addBikeDocument);

// DELETE /api/bikes/:id - Soft delete bike
router.delete("/:id", deleteBike);

export default router;
