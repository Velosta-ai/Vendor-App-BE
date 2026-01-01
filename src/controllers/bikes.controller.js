import prisma from "../config/prisma.js";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  conflictResponse,
  paginatedResponse,
  serverErrorResponse,
  ERROR_CODES,
} from "../utils/response.js";

/**
 * UTILITY: Auto-correct bike status based on bookings
 */
async function autoFixBikeStatus(bikeId, orgId) {
  const now = new Date();

  // A bike is RENTED if it has ANY booking that:
  // - Has started (startDate <= now)
  // - Has NOT been returned (status IN ["ACTIVE", "UPCOMING"])
  // Note: endDate doesn't matter - overdue bookings still mean the bike is RENTED until marked as RETURNED
  const activeBookings = await prisma.booking.findMany({
    where: {
      bikeId,
      organizationId: orgId,
      status: { in: ["ACTIVE", "UPCOMING"] },
      isDeleted: false,
      startDate: { lte: now },
      // Removed endDate check - overdue bookings (endDate < now) still mean bike is RENTED
    },
  });

  // Check if any booking has started (regardless of endDate)
  const currentlyRented = activeBookings.some(
    (b) => new Date(b.startDate) <= now
  );

  if (currentlyRented) {
    await prisma.bike.update({
      where: { id: bikeId },
      data: { status: "RENTED" },
    });
    return "RENTED";
  }

  // Get current bike status
  const bike = await prisma.bike.findUnique({ where: { id: bikeId } });

  // Don't change if in maintenance
  if (bike?.status === "MAINTENANCE") {
    return "MAINTENANCE";
  }

  // No active bookings → ensure bike is AVAILABLE
  await prisma.bike.update({
    where: { id: bikeId },
    data: { status: "AVAILABLE" },
  });

  return "AVAILABLE";
}

/**
 * GET ALL BIKES (ORG SCOPED)
 */
export const getBikes = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { status, search, page = "1", limit = "50" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // First, auto-fix all bike statuses for the organization (BEFORE fetching)
    const allBikes = await prisma.bike.findMany({
      where: { organizationId: orgId, isDeleted: false },
      select: { id: true },
    });
    
    // Run autofix for all bikes and wait for completion
    await Promise.all(allBikes.map((b) => autoFixBikeStatus(b.id, orgId)));

    // Build where clause
    const where = {
      organizationId: orgId,
      isDeleted: false,
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { registrationNumber: { contains: search, mode: "insensitive" } },
        { model: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.bike.count({ where });

    const bikes = await prisma.bike.findMany({
      where,
      include: {
        bookings: {
          where: {
            endDate: { gte: new Date() },
            isDeleted: false,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
    });

    return paginatedResponse(res, bikes, total, pageNum, limitNum);
  } catch (err) {
    console.error("Error fetching bikes:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * GET BIKE BY ID
 */
export const getBikeById = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    const bike = await prisma.bike.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
      include: {
        bookings: {
          where: {
            endDate: { gte: new Date() },
            isDeleted: false,
          },
          orderBy: { startDate: "asc" },
        },
        documents: {
          orderBy: { expiryDate: "asc" },
        },
        maintenanceLogs: {
          orderBy: { date: "desc" },
          take: 10,
        },
      },
    });

    if (!bike) {
      return notFoundResponse(res, "Bike");
    }

    await autoFixBikeStatus(bike.id, orgId);

    return successResponse(res, bike);
  } catch (err) {
    console.error("Error fetching bike:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * CREATE BIKE
 */
export const createBike = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { name, model, registrationNumber, year, dailyRate, images } = req.body;

    // Validate required fields
    if (!name || !registrationNumber || !dailyRate) {
      return errorResponse(
        res,
        "Name, registration number and daily rate are required",
        ERROR_CODES.MISSING_FIELDS,
        400
      );
    }

    // Validate dailyRate is a positive number
    const rate = Number(dailyRate);
    if (isNaN(rate) || rate <= 0) {
      return errorResponse(res, "Daily rate must be a positive number", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    // Normalize registration number
    const normalizedRegNum = registrationNumber.toUpperCase().replace(/\s/g, "");

    // Check organization bike limit
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    const currentBikeCount = await prisma.bike.count({
      where: { organizationId: orgId, isDeleted: false },
    });

    if (currentBikeCount >= org.bikesLimit) {
      return errorResponse(
        res,
        `You have reached your plan's limit of ${org.bikesLimit} bikes. Please upgrade to add more.`,
        "BIKE_LIMIT_REACHED",
        400
      );
    }

    // Check if registration number already exists in this org
    const exists = await prisma.bike.findFirst({
      where: { registrationNumber: normalizedRegNum, organizationId: orgId, isDeleted: false },
    });

    if (exists) {
      return conflictResponse(res, "Registration number already exists in your organization");
    }

    const bike = await prisma.bike.create({
      data: {
        name: name.trim(),
        model: model?.trim() || null,
        registrationNumber: normalizedRegNum,
        year: year ? Number(year) : null,
        dailyRate: rate,
        status: "AVAILABLE",
        images: images || [],
        organizationId: orgId,
      },
    });

    return successResponse(res, bike, "Bike added successfully", 201);
  } catch (err) {
    console.error("Error creating bike:", err);

    // Handle Prisma unique constraint violations
    if (err.code === "P2002") {
      return conflictResponse(res, "Registration number already exists");
    }

    return serverErrorResponse(res, err);
  }
};

/**
 * UPDATE BIKE
 */
export const updateBike = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    // Validate ownership
    const exists = await prisma.bike.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
    });

    if (!exists) {
      return notFoundResponse(res, "Bike");
    }

    const { name, model, registrationNumber, year, dailyRate, status, images } = req.body;

    // If registrationNumber is being changed, check for duplicates
    if (registrationNumber && registrationNumber !== exists.registrationNumber) {
      const normalizedRegNum = registrationNumber.toUpperCase().replace(/\s/g, "");
      const duplicate = await prisma.bike.findFirst({
        where: {
          registrationNumber: normalizedRegNum,
          organizationId: orgId,
          id: { not: id },
          isDeleted: false,
        },
      });

      if (duplicate) {
        return conflictResponse(res, "Registration number already exists in your organization");
      }
    }

    // Validate dailyRate if provided
    if (dailyRate !== undefined) {
      const rate = Number(dailyRate);
      if (isNaN(rate) || rate <= 0) {
        return errorResponse(res, "Daily rate must be a positive number", ERROR_CODES.VALIDATION_ERROR, 400);
      }
    }

    const bike = await prisma.bike.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(model !== undefined && { model: model?.trim() || null }),
        ...(registrationNumber && {
          registrationNumber: registrationNumber.toUpperCase().replace(/\s/g, ""),
        }),
        ...(year !== undefined && { year: year ? Number(year) : null }),
        ...(dailyRate !== undefined && { dailyRate: Number(dailyRate) }),
        ...(status && { status }),
        ...(images !== undefined && { images }),
      },
    });

    await autoFixBikeStatus(id, orgId);

    return successResponse(res, bike, "Bike updated successfully");
  } catch (err) {
    console.error("Error updating bike:", err);

    // Handle Prisma unique constraint violations
    if (err.code === "P2002") {
      return conflictResponse(res, "Registration number already exists");
    }

    return serverErrorResponse(res, err);
  }
};

/**
 * UPDATE STATUS ONLY
 */
export const updateBikeStatus = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    const { status } = req.body;
    if (!status) {
      return errorResponse(res, "Status is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const exists = await prisma.bike.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
    });

    if (!exists) {
      return notFoundResponse(res, "Bike");
    }

    await prisma.bike.update({
      where: { id },
      data: { status: status.toUpperCase() },
    });

    await autoFixBikeStatus(id, orgId);

    return successResponse(res, null, "Status updated");
  } catch (err) {
    console.error("Error updating bike status:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * GET BIKE AVAILABILITY
 */
export const getBikeAvailability = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const bikeId = req.params.id;
    const now = new Date();

    const bike = await prisma.bike.findUnique({ where: { id: bikeId } });
    if (!bike || bike.organizationId !== orgId || bike.isDeleted) {
      return notFoundResponse(res, "Bike");
    }

    // Fetch all future+current bookings
    const bookings = await prisma.booking.findMany({
      where: {
        bikeId,
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        isDeleted: false,
        endDate: { gte: now }, // relevant bookings
      },
      orderBy: { startDate: "asc" },
    });

    // 1️⃣ NO BOOKINGS → ALWAYS AVAILABLE
    if (bookings.length === 0) {
      return successResponse(res, {
        bikeId,
        isAvailableNow: bike.status !== "MAINTENANCE",
        currentBooking: null,
        nextBooking: null,
        nextAvailableDate: now.toISOString(),
        returnInDays: 0,
      });
    }

    // 2️⃣ FIND CURRENT BOOKING (if overlaps NOW)
    const currentBooking =
      bookings.find(
        (b) => new Date(b.startDate) <= now && new Date(b.endDate) >= now
      ) || null;

    // 3️⃣ FIND NEXT BOOKING (that starts AFTER NOW)
    const nextBooking =
      bookings.find((b) => new Date(b.startDate) > now) || null;

    // 4️⃣ BIKE IS AVAILABLE NOW IF NO CURRENT BOOKING
    const isAvailableNow = currentBooking === null && bike.status !== "MAINTENANCE";

    // 5️⃣ nextAvailableDate logic
    let nextAvailableDate;

    if (isAvailableNow) {
      // Bike is free now → available today
      nextAvailableDate = now.toISOString();
    } else {
      // Bike is rented → available after current booking ends
      nextAvailableDate = new Date(currentBooking.endDate).toISOString();
    }

    // 6️⃣ returnInDays ONLY IF THE BIKE IS CURRENTLY RENTED
    const returnInDays = currentBooking
      ? Math.ceil(
          (new Date(currentBooking.endDate) - now) / (1000 * 60 * 60 * 24)
        )
      : 0;

    return successResponse(res, {
      bikeId,
      isAvailableNow,
      currentBooking: currentBooking
        ? {
            id: currentBooking.id,
            customerName: currentBooking.customerName,
            endDate: currentBooking.endDate,
          }
        : null,
      nextBooking: nextBooking
        ? {
            id: nextBooking.id,
            customerName: nextBooking.customerName,
            startDate: nextBooking.startDate,
          }
        : null,
      nextAvailableDate,
      returnInDays,
    });
  } catch (err) {
    console.error("getBikeAvailability error:", err);
    return serverErrorResponse(res, err);
  }
};

export const toggleBikeMaintenance = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const bikeId = req.params.id;

    const bike = await prisma.bike.findUnique({ where: { id: bikeId } });

    if (!bike || bike.organizationId !== orgId || bike.isDeleted) {
      return notFoundResponse(res, "Bike");
    }

    // Cannot place bike into maintenance if rented
    if (bike.status === "RENTED") {
      return errorResponse(
        res,
        "Bike is currently rented. Cannot switch to maintenance.",
        ERROR_CODES.BIKE_RENTED,
        400
      );
    }

    const newStatus = bike.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE";

    const updated = await prisma.bike.update({
      where: { id: bikeId },
      data: { status: newStatus },
    });

    return successResponse(res, { bike: updated }, `Bike ${newStatus === "MAINTENANCE" ? "set to" : "removed from"} maintenance`);
  } catch (err) {
    console.error("toggleBikeMaintenance error:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * DELETE BIKE (SOFT DELETE)
 */
export const deleteBike = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    // Validate ownership
    const exists = await prisma.bike.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
      include: { bookings: { where: { isDeleted: false } } },
    });

    if (!exists) {
      return notFoundResponse(res, "Bike");
    }

    // Check if bike has any active or upcoming bookings
    const activeBookings = exists.bookings.filter(
      (b) => b.status === "ACTIVE" || b.status === "UPCOMING"
    );

    if (activeBookings.length > 0) {
      return errorResponse(
        res,
        "Cannot delete bike with active or upcoming bookings",
        ERROR_CODES.ACTIVE_BOOKINGS_EXIST,
        400
      );
    }

    // Soft delete the bike
    await prisma.bike.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return successResponse(res, null, "Bike deleted successfully");
  } catch (err) {
    console.error("Error deleting bike:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * ADD MAINTENANCE LOG
 */
export const addMaintenanceLog = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;
    const { type, description, cost, date, notes } = req.body;

    if (!type) {
      return errorResponse(res, "Maintenance type is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const bike = await prisma.bike.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
    });

    if (!bike) {
      return notFoundResponse(res, "Bike");
    }

    const log = await prisma.maintenanceLog.create({
      data: {
        bikeId: id,
        type: type.toUpperCase(),
        description: description?.trim() || null,
        cost: Number(cost) || 0,
        date: date ? new Date(date) : new Date(),
        notes: notes?.trim() || null,
      },
    });

    return successResponse(res, log, "Maintenance log added", 201);
  } catch (err) {
    console.error("Error adding maintenance log:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * ADD BIKE DOCUMENT
 */
export const addBikeDocument = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;
    const { type, url, expiryDate } = req.body;

    if (!type || !url) {
      return errorResponse(res, "Document type and URL are required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const bike = await prisma.bike.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
    });

    if (!bike) {
      return notFoundResponse(res, "Bike");
    }

    const doc = await prisma.bikeDocument.create({
      data: {
        bikeId: id,
        type: type.toUpperCase(),
        url,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    return successResponse(res, doc, "Document added", 201);
  } catch (err) {
    console.error("Error adding bike document:", err);
    return serverErrorResponse(res, err);
  }
};

/**
 * GET EXPIRING DOCUMENTS
 */
export const getExpiringDocuments = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { days = "30" } = req.query;

    const daysNum = parseInt(days, 10) || 30;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysNum);

    const documents = await prisma.bikeDocument.findMany({
      where: {
        bike: {
          organizationId: orgId,
          isDeleted: false,
        },
        expiryDate: {
          lte: futureDate,
          gte: new Date(),
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
      orderBy: { expiryDate: "asc" },
    });

    return successResponse(res, documents);
  } catch (err) {
    console.error("Error fetching expiring documents:", err);
    return serverErrorResponse(res, err);
  }
};
