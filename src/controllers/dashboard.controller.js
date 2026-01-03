import prisma from "../config/prisma.js";
import { successResponse, serverErrorResponse } from "../utils/response.js";

/**
 * Auto-fix bike status based on active bookings
 */
async function autoFixBikeStatus(bikeId, orgId) {
  const now = new Date();

  // A bike is RENTED if it has ANY booking that:
  // - Has started (startDate <= now)
  // - Has NOT been returned (status IN ["ACTIVE", "UPCOMING"])
  // Note: endDate doesn't matter - overdue bookings still mean the bike is RENTED until marked as RETURNED
  const activeBooking = await prisma.booking.findFirst({
    where: {
      bikeId,
      organizationId: orgId,
      status: { in: ["ACTIVE", "UPCOMING"] },
      isDeleted: false,
      startDate: { lte: now },
      // Removed endDate check - overdue bookings (endDate < now) still mean bike is RENTED
    },
  });

  // Get current bike
  const bike = await prisma.bike.findUnique({ where: { id: bikeId } });
  if (!bike || bike.isDeleted) return;

  // Don't change if in maintenance
  if (bike.status === "MAINTENANCE") return;

  if (activeBooking) {
    // Bike should be RENTED
    if (bike.status !== "RENTED") {
      await prisma.bike.update({
        where: { id: bikeId },
        data: { status: "RENTED" },
      });
    }
  } else {
    // No active booking, should be AVAILABLE
    if (bike.status === "RENTED") {
      await prisma.bike.update({
        where: { id: bikeId },
        data: { status: "AVAILABLE" },
      });
    }
  }
}

/**
 * Process items in batches to avoid exhausting database connections
 */
async function processBatch(items, batchSize, asyncFn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(asyncFn));
  }
}

/**
 * Sync all bike statuses for an organization
 */
async function syncAllBikeStatuses(orgId) {
  const bikes = await prisma.bike.findMany({
    where: { organizationId: orgId, isDeleted: false },
    select: { id: true },
  });

  // Process in batches of 5 to avoid exhausting DB connections
  await processBatch(bikes, 5, (b) => autoFixBikeStatus(b.id, orgId));
}

export const getDashboard = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const now = new Date();

    // ───────────────────────────────────────────────
    // SYNC BIKE STATUSES FIRST
    // ───────────────────────────────────────────────
    await syncAllBikeStatuses(orgId);

    // Get organization details
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        plan: true,
        bikesLimit: true,
        inviteCode: true,
      },
    });

    // Get users count for organization
    const usersCount = await prisma.account.count({
      where: { organizationId: orgId, isActive: true },
    });

    // ───────────────────────────────────────────────
    // BIKES SUMMARY (after sync)
    // ───────────────────────────────────────────────
    const totalBikes = await prisma.bike.count({
      where: { organizationId: orgId, isDeleted: false },
    });

    const availableBikes = await prisma.bike.count({
      where: { organizationId: orgId, status: "AVAILABLE", isDeleted: false },
    });

    const rentedBikes = await prisma.bike.count({
      where: { organizationId: orgId, status: "RENTED", isDeleted: false },
    });

    const maintenanceBikes = await prisma.bike.count({
      where: { organizationId: orgId, status: "MAINTENANCE", isDeleted: false },
    });

    // ───────────────────────────────────────────────
    // BOOKINGS SUMMARY (based on dates, not status)
    // ───────────────────────────────────────────────
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Get all non-returned bookings to categorize by dates
    const allBookings = await prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        isDeleted: false,
      },
      select: {
        startDate: true,
        endDate: true,
      },
    });

    // Categorize bookings based on dates (matches frontend logic)
    let activeBookings = 0;
    let upcomingBookings = 0;
    let pendingReturns = 0;

    allBookings.forEach((booking) => {
      const startDate = new Date(booking.startDate);
      const endDate = new Date(booking.endDate);
      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      const today = todayStart;

      if (startDay > today) {
        // Start date is in the future → UPCOMING
        upcomingBookings++;
      } else if (endDay < today) {
        // End date has passed but not returned → ACTIVE (overdue/pending return)
        activeBookings++;
        pendingReturns++;
      } else {
        // startDay <= today && endDay >= today → ACTIVE
        activeBookings++;
      }
    });


    // Returned today
    const returnedToday = await prisma.booking.count({
      where: {
        organizationId: orgId,
        status: "RETURNED",
        isDeleted: false,
        updatedAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    // Start of this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Completed this month
    const completedThisMonth = await prisma.booking.count({
      where: {
        organizationId: orgId,
        status: "RETURNED",
        isDeleted: false,
        updatedAt: {
          gte: monthStart,
          lt: nextMonthStart,
        },
      },
    });

    // ───────────────────────────────────────────────
    // REVENUE
    // ───────────────────────────────────────────────
    // Total revenue (all time)
    const totalRevenueResult = await prisma.booking.aggregate({
      where: { organizationId: orgId, isDeleted: false },
      _sum: { paidAmount: true },
    });
    const totalRevenue = totalRevenueResult._sum.paidAmount || 0;

    // This month revenue
    const thisMonthRevenueResult = await prisma.booking.aggregate({
      where: {
        organizationId: orgId,
        isDeleted: false,
        createdAt: {
          gte: monthStart,
          lt: nextMonthStart,
        },
      },
      _sum: { paidAmount: true },
    });
    const thisMonthRevenue = thisMonthRevenueResult._sum.paidAmount || 0;

    // Last month revenue
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthRevenueResult = await prisma.booking.aggregate({
      where: {
        organizationId: orgId,
        isDeleted: false,
        createdAt: {
          gte: lastMonthStart,
          lt: monthStart,
        },
      },
      _sum: { paidAmount: true },
    });
    const lastMonthRevenue = lastMonthRevenueResult._sum.paidAmount || 0;

    // Pending revenue (unpaid balance from active/upcoming bookings)
    const pendingRevenueResult = await prisma.booking.aggregate({
      where: {
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        isDeleted: false,
      },
      _sum: { totalAmount: true, paidAmount: true },
    });
    const pendingRevenue =
      (pendingRevenueResult._sum.totalAmount || 0) -
      (pendingRevenueResult._sum.paidAmount || 0);

    // ───────────────────────────────────────────────
    // LEADS SUMMARY
    // ───────────────────────────────────────────────
    const newLeads = await prisma.lead.count({
      where: { organizationId: orgId, status: "new" },
    });

    const openLeads = await prisma.lead.count({
      where: {
        organizationId: orgId,
        status: { in: ["new", "contacted", "in_progress"] },
      },
    });

    // Leads converted this month
    const convertedThisMonth = await prisma.lead.count({
      where: {
        organizationId: orgId,
        status: "converted",
        timestamp: {
          gte: monthStart,
          lt: nextMonthStart,
        },
      },
    });

    // ───────────────────────────────────────────────
    // RECENT ACTIVITY
    // ───────────────────────────────────────────────
    // Recent bookings
    const recentBookings = await prisma.booking.findMany({
      where: { organizationId: orgId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        customerName: true,
        phone: true,
        status: true,
        startDate: true,
        endDate: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        bike: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
          },
        },
      },
    });

    // Bikes due for return today
    const dueToday = await prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: "ACTIVE",
        isDeleted: false,
        endDate: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
      include: {
        bike: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
          },
        },
      },
    });

    // Overdue returns
    const overdueReturns = await prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: "ACTIVE",
        isDeleted: false,
        endDate: { lt: todayStart },
      },
      include: {
        bike: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
          },
        },
      },
      orderBy: { endDate: "asc" },
      take: 10,
    });

    // ───────────────────────────────────────────────
    // RESPONSE - Following the specified format
    // ───────────────────────────────────────────────
    return successResponse(res, {
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
        completedThisMonth,
      },
      leads: {
        new: newLeads,
        open: openLeads,
        convertedThisMonth,
      },
      revenue: {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
        lastMonth: lastMonthRevenue,
        pending: pendingRevenue,
      },
      vendor: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        bikesLimit: organization.bikesLimit,
        usersCount,
        inviteCode: organization.inviteCode,
      },
      // Also include organization for backward compatibility
      organization: {
        id: organization.id,
        name: organization.name,
      },
      // Additional helpful data
      activity: {
        recentBookings,
        dueToday,
        overdueReturns,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * GET /api/dashboard/stats
 * Returns quick stats for widgets
 */
export const getQuickStats = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [activeBikes, activeBookings, pendingReturns, newLeads] = await Promise.all([
      prisma.bike.count({
        where: { organizationId: orgId, status: "RENTED", isDeleted: false },
      }),
      prisma.booking.count({
        where: { organizationId: orgId, status: "ACTIVE", isDeleted: false },
      }),
      prisma.booking.count({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          isDeleted: false,
          endDate: { lt: now },
        },
      }),
      prisma.lead.count({
        where: { organizationId: orgId, status: "new" },
      }),
    ]);

    return successResponse(res, {
      activeBikes,
      activeBookings,
      pendingReturns,
      newLeads,
    });
  } catch (err) {
    console.error("Quick stats error:", err);
    return serverErrorResponse(res, err);
  }
};
