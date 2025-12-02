import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import env from "../config/env.js";

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    console.log("unauthh middle");

    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.split(" ")[1];

    const payload = jwt.verify(token, env.JWT_SECRET);

    // Fetch account
    const account = await prisma.account.findUnique({
      where: { id: payload.accountId },
    });
    console.log("unauth");

    if (!account) return res.status(401).json({ message: "Unauthorized" });

    // Attach to request
    req.account = account;
    req.organizationId = payload.organizationId;

    next();
  } catch (err) {
    console.log(err, "middle");
    return res.status(401).json({ message: "Unauthorized" });
  }
}
