import { Router } from "express";
import {
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  markReturned,
  bulkMarkReturned,
  deleteBooking,
  addPayment,
} from "../controllers/bookings.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(authenticate);

// GET /api/bookings - List bookings with pagination and filters
// Query params: page, limit, status, search, bikeId, dateFrom, dateTo
router.get("/", getBookings);

// GET /api/bookings/:id - Get single booking by ID
router.get("/:id", getBookingById);

// POST /api/bookings - Create new booking
router.post("/", createBooking);

// PUT /api/bookings/:id - Update booking
router.put("/:id", updateBooking);

// PATCH /api/bookings/:id/returned - Mark booking as returned
router.patch("/:id/returned", markReturned);

// POST /api/bookings/bulk-return - Mark multiple bookings as returned
router.post("/bulk-return", bulkMarkReturned);

// POST /api/bookings/:id/payments - Add payment to booking
router.post("/:id/payments", addPayment);

// DELETE /api/bookings/:id - Soft delete booking
router.delete("/:id", deleteBooking);

export default router;
