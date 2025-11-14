import { Router } from "express";
import {
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  markReturned,
  deleteBooking,
} from "../controllers/bookings.controller.js";

const router = Router();

router.get("/", getBookings);
router.get("/:id", getBookingById);
router.post("/", createBooking);
router.put("/:id", updateBooking);
router.patch("/:id/returned", markReturned);
router.delete("/:id", deleteBooking);

export default router;
