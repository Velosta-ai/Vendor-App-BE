import { Router } from "express";
import {
  createLead,
  getLeads,
  getLeadById,
  updateLeadStatus,
  updateLead,
  deleteLead,
  convertLead,
  getLeadStats,
} from "../controllers/leads.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(authenticate);

// GET /api/leads/stats - Get lead statistics
router.get("/stats", getLeadStats);

// GET /api/leads - List leads with pagination and filters
// Query params: status, source, search, page, limit
router.get("/", getLeads);

// GET /api/leads/:id - Get single lead
router.get("/:id", getLeadById);

// POST /api/leads - Create new lead
router.post("/", createLead);

// PUT /api/leads/:id - Update lead
router.put("/:id", updateLead);

// PATCH /api/leads/:id/status - Update status only
router.patch("/:id/status", updateLeadStatus);

// POST /api/leads/:id/convert - Convert lead to booking
router.post("/:id/convert", convertLead);

// DELETE /api/leads/:id - Delete lead
router.delete("/:id", deleteLead);

export default router;
