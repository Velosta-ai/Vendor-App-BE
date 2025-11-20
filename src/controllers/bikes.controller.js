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

    if (!name || !dailyRate)
      return res.status(400).json({ error: "Name & dailyRate are required" });

    // Unique reg number inside org
    const exists = await prisma.bike.findFirst({
      where: { registrationNumber, organizationId: orgId },
    });

    if (exists)
      return res
        .status(409)
        .json({ error: "Registration number already exists" });

    const bike = await prisma.bike.create({
      data: {
        name,
        model,
        registrationNumber,
        year: year ? Number(year) : null,
        dailyRate: Number(dailyRate),
        status: "AVAILABLE",
        organizationId: orgId,
      },
    });

    res.json(bike);
  } catch (err) {
    console.error("Error creating bike:", err);
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

    const bike = await prisma.bike.update({
      where: { id },
      data: {
        name,
        model,
        registrationNumber,
        year: year ? Number(year) : null,
        dailyRate: dailyRate ? Number(dailyRate) : undefined,
        status,
      },
    });

    await autoFixBikeStatus(id, orgId);

    res.json(bike);
  } catch (err) {
    console.error("Error updating bike:", err);
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

    // Fix status based on bookings
    const correctedStatus = await autoFixBikeStatus(bikeId, orgId);

    const bookings = await prisma.booking.findMany({
      where: {
        bikeId,
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        endDate: { gte: now },
      },
      orderBy: { startDate: "asc" },
    });

    if (bookings.length === 0) {
      return res.json({
        bikeId,
        isAvailableNow: true,
        nextAvailableDate: null,
        currentBooking: null,
        returnInDays: 0,
      });
    }

    const currentBooking =
      bookings.find(
        (b) => new Date(b.startDate) <= now && new Date(b.endDate) >= now
      ) || null;

    const lastEnd = new Date(bookings[bookings.length - 1].endDate);

    const returnInDays = Math.ceil((lastEnd - now) / (1000 * 60 * 60 * 24));

    return res.json({
      bikeId,
      isAvailableNow: correctedStatus === "AVAILABLE" && !currentBooking,
      nextAvailableDate: lastEnd.toISOString(),
      currentBooking,
      returnInDays,
    });
  } catch (err) {
    console.error("getBikeAvailability error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
