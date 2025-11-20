import prisma from "../../config/prismaClient.js";

export const getDashboard = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const now = new Date();

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
