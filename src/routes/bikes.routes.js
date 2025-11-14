import { Router } from "express";
import {
  getBikes,
  getBikeById,
  createBike,
  updateBike,
  updateBikeStatus,
} from "../controllers/bikes.controller.js";

const router = Router();

router.get("/", getBikes);
router.get("/:id", getBikeById);
router.post("/", createBike);
router.put("/:id", updateBike);
router.patch("/:id/status", updateBikeStatus);

export default router;
