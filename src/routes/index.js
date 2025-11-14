import express from "express";
import leadsRoutes from "./leads.routes.js";
import bikesRoutes from "./bikes.routes.js";
import bookingsRoutes from "./bookings.routes.js";

const router = express.Router();

router.use("/leads", leadsRoutes);
router.use("/bikes", bikesRoutes);
router.use("/bookings", bookingsRoutes);

export default router;
