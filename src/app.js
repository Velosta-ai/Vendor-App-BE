import express from "express";
import cors from "cors";
import leadsRoutes from "./routes/leads.routes.js";
import bikesRoutes from "./routes/bikes.routes.js";
import bookingsRoutes from "./routes/bookings.routes.js";
import router from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api", router);

export default app;
