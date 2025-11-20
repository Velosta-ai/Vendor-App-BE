import { Router } from "express";
import { registerOrg, login, joinOrg } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register-org", registerOrg);
router.post("/login", login);
router.post("/join-org", joinOrg);

export default router;
