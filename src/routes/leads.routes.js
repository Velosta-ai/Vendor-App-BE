import { Router } from "express";
import {
  createLead,
  getLeads,
  updateLeadStatus,
  deleteLead,
} from "../controllers/leads.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(authenticate);

// POST /leads → add new manual lead
router.post("/", createLead);

// GET /leads → list all
router.get("/", getLeads);

// PATCH /leads/:id/status → update status only
router.patch("/:id/status", updateLeadStatus);

// DELETE /leads/:id → remove (optional)
router.delete("/:id", deleteLead);

export default router;
