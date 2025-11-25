import prisma from "../config/prisma.js";

export const getDashboard = async (req, res) => {
  try {
    console.log("hola");
    const orgId = req.organizationId;
    console.log("Organization ID:", orgId);
    const now = new Date();

    // Get organization details
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, inviteCode: true },
    });
    console.log("Organization:", organization);

    // ───────────────────────────────────────────────
    // BIKES SUMMARY
    // ───────────────────────────────────────────────
    const totalBikes = await prisma.bike.count({
      where: { organizationId: orgId },
    });

    const availableBikes = await prisma.bike.count({
      where: { organizationId: orgId, status: "AVAILABLE" },
    });

    const rentedBikes = await prisma.bike.count({
      where: { organizationId: orgId, status: "RENTED" },
    });

    const maintenanceBikes = await prisma.bike.count({
      where: { organizationId: orgId, status: "MAINTENANCE" },
    });

    // ───────────────────────────────────────────────
    // BOOKINGS SUMMARY
    // ───────────────────────────────────────────────
    const activeBookings = await prisma.booking.count({
      where: { organizationId: orgId, status: "ACTIVE" },
    });

    const upcomingBookings = await prisma.booking.count({
      where: { organizationId: orgId, status: "UPCOMING" },
    });

    const pendingReturns = await prisma.booking.count({
      where: {
        organizationId: orgId,
        status: "ACTIVE",
        endDate: { lt: now },
      },
    });

    const returnedToday = await prisma.booking.count({
      where: {
        organizationId: orgId,
        status: "RETURNED",
        updatedAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });

    // ───────────────────────────────────────────────
    // REVENUE
    // ───────────────────────────────────────────────
    const revenue = await prisma.booking.aggregate({
      where: { organizationId: orgId },
      _sum: { paidAmount: true },
    });

    const totalRevenue = revenue._sum.paidAmount || 0;

    const monthRevenue = await prisma.booking.aggregate({
      where: {
        organizationId: orgId,
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
      _sum: { paidAmount: true },
    });

    const thisMonthRevenue = monthRevenue._sum.paidAmount || 0;

    // ───────────────────────────────────────────────
    // LEADS SUMMARY
    // ───────────────────────────────────────────────
    const newLeads = await prisma.lead.count({
      where: { organizationId: orgId, status: "new" },
    });

    const openLeads = await prisma.lead.count({
      where: {
        organizationId: orgId,
        status: { in: ["new", "in_progress"] },
      },
    });

    // ───────────────────────────────────────────────
    // RESPONSE
    // ───────────────────────────────────────────────
    res.json({
      organization: {
        id: organization.id,
        name: organization.name,
      },
      bikes: {
        total: totalBikes,
        available: availableBikes,
        rented: rentedBikes,
        maintenance: maintenanceBikes,
      },
      bookings: {
        active: activeBookings,
        upcoming: upcomingBookings,
        pendingReturns,
        returnedToday,
      },
      leads: {
        new: newLeads,
        open: openLeads,
      },
      revenue: {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const getSettingDetails = async (req, res) => {
  try {
    const orgId = req.organizationId;

    // Get organization settings
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        inviteCode: true,
        accounts: true,
      },
    });

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    res.json({ organization });
  } catch (err) {
    console.error("Get Setting Details error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
