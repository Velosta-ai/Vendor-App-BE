import "dotenv/config";
import app from "./app.js";
import cors from "cors";
import express from "express";

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Change this line - add '0.0.0.0' to listen on all network interfaces
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Mobile access: http://10.24.36.143:${PORT}`);
});
