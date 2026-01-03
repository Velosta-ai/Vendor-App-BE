import express from "express";
import leadsRoutes from "./leads.routes.js";
import bikesRoutes from "./bikes.routes.js";
import bookingsRoutes from "./bookings.routes.js";
import authRoutes from "./auth.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import uploadRoutes from "./upload.routes.js";

const router = express.Router();

router.use("/leads", leadsRoutes);
router.use("/bikes", bikesRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/auth", authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/upload", uploadRoutes);

export default router;
