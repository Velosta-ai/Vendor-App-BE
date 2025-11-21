import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import env from "../config/env.js";

// ───────────────────────────────────────────────
// REGISTER ORG + FIRST ACCOUNT (ADMIN)
// ───────────────────────────────────────────────
// POST /api/auth/register-org
export async function registerOrg(req, res, next) {
  try {
    console.log("hola");
    const { orgName, name, email, password, phone } = req.body;
    console.log(orgName);
    // Validate required fields
    if (!orgName || !name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if email already registered
    const existing = await prisma.account.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Generate unique organization invite code
    const inviteCode =
      "ORG-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 1. Create organization with invite code
    const org = await prisma.organization.create({
      data: {
        name: orgName,
        inviteCode: inviteCode,
      },
    });

    // 2. Create first account as ADMIN
    const passwordHash = await bcrypt.hash(password, 10);

    const account = await prisma.account.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: "ADMIN",
        organizationId: org.id,
      },
    });

    // 3. Issue token
    const token = jwt.sign(
      {
        accountId: account.id,
        organizationId: org.id,
        role: account.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      token,
      organization: {
        id: org.id,
        name: org.name,
        inviteCode: org.inviteCode, // important
      },
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// LOGIN
// ───────────────────────────────────────────────
// POST /api/auth/login
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    const account = await prisma.account.findUnique({ 
      where: { email },
      include: { organization: true }
    });

    if (!account)
      return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, account.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      {
        accountId: account.id,
        organizationId: account.organizationId,
        role: account.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      organization: {
        id: account.organization.id,
        name: account.organization.name,
      },
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function joinOrg(req, res, next) {
  try {
    const { inviteCode, name, email, password, phone } = req.body;

    const org = await prisma.organization.findUnique({
      where: { inviteCode },
    });

    if (!org) return res.status(400).json({ message: "Invalid invite code" });

    const existing = await prisma.account.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ message: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);

    const account = await prisma.account.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: "STAFF",
        organizationId: org.id,
      },
    });

    const token = jwt.sign(
      {
        accountId: account.id,
        organizationId: org.id,
        role: account.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      token,
      organization: { id: org.id, name: org.name },
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
      },
    });
  } catch (err) {
    next(err);
  }
}
