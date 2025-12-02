import prisma from "../config/prisma.js";

/**
 * UTILITY: Auto-correct bike status based on bookings
 */
async function autoFixBikeStatus(bikeId, orgId) {
  const now = new Date();

  // find any ACTIVE or UPCOMING bookings that haven't ended yet
  const activeBookings = await prisma.booking.findMany({
    where: {
      bikeId,
      organizationId: orgId,
      status: { in: ["ACTIVE", "UPCOMING"] },
      endDate: { gte: now },
    },
  });

  if (activeBookings.length === 0) {
    // No active bookings → ensure bike is AVAILABLE
    await prisma.bike.update({
      where: { id: bikeId },
      data: { status: "AVAILABLE" },
    });
    return "AVAILABLE";
  }

  // If active bookings exist → bike should be RENTED
  await prisma.bike.update({
    where: { id: bikeId },
    data: { status: "RENTED" },
  });

  return "R";
}

/**
 * GET ALL BIKES (ORG SCOPED)
 */
export const getBikes = async (req, res) => {
  try {
    const orgId = req.organizationId;
    console.log(orgId);

    const bikes = await prisma.bike.findMany({
      where: { organizationId: orgId },
      include: {
        bookings: {
          where: {
            endDate: { gte: new Date() }, // only future/active bookings
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Auto-fix statuses
    for (const b of bikes) {
      await autoFixBikeStatus(b.id, orgId);
    }

    res.json(bikes);
  } catch (err) {
    console.error("Error fetching bikes:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET BIKE BY ID
 */
export const getBikeById = async (req, res) => {
  try {
    const orgId = req.organizationId;

    const bike = await prisma.bike.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: {
        bookings: {
          where: { endDate: { gte: new Date() } },
        },
      },
    });

    if (!bike) return res.status(404).json({ error: "Bike not found" });

    await autoFixBikeStatus(bike.id, orgId);

    res.json(bike);
  } catch (err) {
    console.error("Error fetching bike:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * CREATE BIKE
 */
export const createBike = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { name, model, registrationNumber, year, dailyRate } = req.body;

    // Validate required fields
    if (!name || !registrationNumber || !dailyRate) {
      return res.status(400).json({
        error: "Name, registration number and daily rate are required",
      });
    }

    // Validate dailyRate is a positive number
    const rate = Number(dailyRate);
    if (isNaN(rate) || rate <= 0) {
      return res.status(400).json({
        error: "Daily rate must be a positive number",
      });
    }

    // Check if registration number already exists in this org
    const exists = await prisma.bike.findFirst({
      where: { registrationNumber, organizationId: orgId },
    });

    if (exists) {
      return res.status(409).json({
        error: "Registration number already exists in your organization",
      });
    }

    const bike = await prisma.bike.create({
      data: {
        name,
        model: model || null,
        registrationNumber,
        year: year ? Number(year) : null,
        dailyRate: rate,
        status: "AVAILABLE",
        organizationId: orgId,
      },
    });

    res.status(201).json(bike);
  } catch (err) {
    console.error("Error creating bike:", err);

    // Handle Prisma unique constraint violations
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Registration number already exists",
      });
    }

    res.status(500).json({ error: "Server error" });
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
      where: { id, organizationId: orgId },
    });

    if (!exists) return res.status(404).json({ error: "Bike not found" });

    const { name, model, registrationNumber, year, dailyRate, status } =
      req.body;

    // If registrationNumber is being changed, check for duplicates
    if (
      registrationNumber &&
      registrationNumber !== exists.registrationNumber
    ) {
      const duplicate = await prisma.bike.findFirst({
        where: {
          registrationNumber,
          organizationId: orgId,
          id: { not: id },
        },
      });

      if (duplicate) {
        return res.status(409).json({
          error: "Registration number already exists in your organization",
        });
      }
    }

    // Validate dailyRate if provided
    if (dailyRate !== undefined) {
      const rate = Number(dailyRate);
      if (isNaN(rate) || rate <= 0) {
        return res.status(400).json({
          error: "Daily rate must be a positive number",
        });
      }
    }

    const bike = await prisma.bike.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(model !== undefined && { model }),
        ...(registrationNumber && { registrationNumber }),
        ...(year && { year: Number(year) }),
        ...(dailyRate && { dailyRate: Number(dailyRate) }),
        ...(status && { status }),
      },
    });

    await autoFixBikeStatus(id, orgId);

    res.json(bike);
  } catch (err) {
    console.error("Error updating bike:", err);

    // Handle Prisma unique constraint violations
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Registration number already exists",
      });
    }

    res.status(500).json({ error: "Server error" });
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
    if (!status) return res.status(400).json({ error: "Status required" });

    const exists = await prisma.bike.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!exists) return res.status(404).json({ error: "Bike not found" });

    await prisma.bike.update({
      where: { id },
      data: { status: status.toUpperCase() },
    });

    await autoFixBikeStatus(id, orgId);

    res.json({ message: "Status updated" });
  } catch (err) {
    console.error("Error updating bike status:", err);
    res.status(500).json({ error: "Server error" });
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
    if (!bike || bike.organizationId !== orgId)
      return res.status(404).json({ error: "Bike not found" });

    // Fetch all future+current bookings
    const bookings = await prisma.booking.findMany({
      where: {
        bikeId,
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        endDate: { gte: now }, // relevant bookings
      },
      orderBy: { startDate: "asc" },
    });

    // 1️⃣ NO BOOKINGS → ALWAYS AVAILABLE
    if (bookings.length === 0) {
      return res.json({
        bikeId,
        isAvailableNow: true,
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
    const isAvailableNow = currentBooking === null;

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

    return res.json({
      bikeId,
      isAvailableNow,
      currentBooking,
      nextBooking,
      nextAvailableDate,
      returnInDays,
    });
  } catch (err) {
    console.error("getBikeAvailability error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const toggleBikeMaintenance = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const bikeId = req.params.id;

    const bike = await prisma.bike.findUnique({ where: { id: bikeId } });

    if (!bike || bike.organizationId !== orgId) {
      return res.status(404).json({ error: "Bike not found" });
    }

    // Cannot place bike into maintenance if rented
    if (bike.status === "RENTED") {
      return res.status(400).json({
        error: "Bike is currently rented. Cannot switch to maintenance.",
      });
    }

    const newStatus =
      bike.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE";

    const updated = await prisma.bike.update({
      where: { id: bikeId },
      data: { status: newStatus },
    });

    return res.json({
      message: "Bike status updated",
      bike: updated,
    });
  } catch (err) {
    console.error("toggleBikeMaintenance error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * DELETE BIKE
 */
export const deleteBike = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    // Validate ownership
    const exists = await prisma.bike.findFirst({
      where: { id, organizationId: orgId },
      include: { bookings: true },
    });

    if (!exists) return res.status(404).json({ error: "Bike not found" });

    // Check if bike has any active or upcoming bookings
    const activeBookings = exists.bookings.filter(
      (b) => b.status === "ACTIVE" || b.status === "UPCOMING"
    );

    if (activeBookings.length > 0) {
      return res.status(400).json({
        error: "Cannot delete bike with active or upcoming bookings",
      });
    }

    // Delete the bike
    await prisma.bike.delete({ where: { id } });

    res.json({ message: "Bike deleted successfully" });
  } catch (err) {
    console.error("Error deleting bike:", err);
    res.status(500).json({ error: "Server error" });
  }
};
