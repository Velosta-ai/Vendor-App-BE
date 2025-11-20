import { Router } from "express";
import {
  getBikes,
  getBikeById,
  createBike,
  updateBike,
  updateBikeStatus,
  getBikeAvailability,
} from "../controllers/bikes.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(authenticate);

router.get("/", getBikes);
router.get("/:id", getBikeById);
router.post("/", createBike);
router.put("/:id", updateBike);
router.patch("/:id/status", updateBikeStatus);
router.get("/:id/availability", getBikeAvailability);
export default router;
