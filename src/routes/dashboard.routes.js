import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { getDashboard, getQuickStats } from "../controllers/dashboard.controller.js";

const router = Router();

router.use(authenticate);

// GET /api/dashboard - Full dashboard data
router.get("/", getDashboard);

// GET /api/dashboard/stats - Quick stats for widgets
router.get("/stats", getQuickStats);

export default router;
