import { Router } from "express";
import {
  createLead,
  getLeads,
  updateLeadStatus,
  deleteLead,
} from "../controllers/leads.controller.js";

const router = Router();

// POST /leads → add new manual lead
router.post("/", createLead);

// GET /leads → list all
router.get("/", getLeads);

// PATCH /leads/:id/status → update status only
router.patch("/:id/status", updateLeadStatus);

// DELETE /leads/:id → remove (optional)
router.delete("/:id", deleteLead);

export default router;
