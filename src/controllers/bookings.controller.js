import prisma from "../config/prisma.js";

/** Utility: calculate days */
const calculateDays = (start, end) => {
  return Math.max(
    1,
    Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24))
  );
};

/** Auto-fix bike status based on past/future bookings */
const autoFixBikeStatus = async (bikeId, orgId) => {
  const now = new Date();

  // Find if bike has ANY active/upcoming booking at this moment
  const activeBooking = await prisma.booking.findFirst({
    where: {
      bikeId,
      organizationId: orgId,
      status: { in: ["ACTIVE", "UPCOMING"] },
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });

  if (activeBooking) {
    await prisma.bike.update({
      where: { id: bikeId },
      data: { status: "RENTED" },
    });
    return "RENTED";
  }

  // If bike has no ongoing booking → AVAILABLE
  await prisma.bike.update({
    where: { id: bikeId },
    data: { status: "AVAILABLE" },
  });
  return "AVAILABLE";
};

/** Get all bookings (org scoped) */
export const getBookings = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { status } = req.query;

    const bookings = await prisma.booking.findMany({
      where: {
        organizationId: orgId,
        ...(status ? { status } : {}),
      },
      include: { bike: true },
      orderBy: { startDate: "desc" },
    });

    res.json(bookings);
  } catch (err) {
    console.error("Error loading bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** Get single booking */
export const getBookingById = async (req, res) => {
  try {
    const orgId = req.organizationId;

    const booking = await prisma.booking.findFirst({
      where: {
        id: req.params.id,
        organizationId: orgId,
      },
      include: { bike: true },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    res.json(booking);
  } catch (err) {
    console.error("Error retrieving booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** Create booking */
export const createBooking = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const {
      customerName,
      phone,
      bikeId,
      startDate,
      endDate,
      totalAmount,
      paidAmount,
      notes,
    } = req.body;

    if (!customerName || !phone || !bikeId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check bike belongs to org
    const bike = await prisma.bike.findFirst({
      where: { id: bikeId, organizationId: orgId },
    });
    if (!bike) return res.status(400).json({ error: "Bike not found" });

    // FIX: Auto-update bike.status before validation
    const realStatus = await autoFixBikeStatus(bikeId, orgId);

    // Check if booking overlaps
    const overlap = await prisma.booking.findFirst({
      where: {
        bikeId,
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        OR: [
          {
            startDate: { lte: new Date(endDate) },
            endDate: { gte: new Date(startDate) },
          },
        ],
      },
    });

    if (overlap) {
      return res.status(400).json({
        error: "Bike already booked for selected date range",
        blockingBooking: overlap,
      });
    }

    // If no overlap, bike is considered available regardless of current stored status
    const days = calculateDays(startDate, endDate);
    const autoAmount = days * bike.dailyRate;

    const booking = await prisma.booking.create({
      data: {
        customerName,
        phone,
        bikeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalAmount: Number(totalAmount || autoAmount),
        paidAmount: Number(paidAmount || 0),
        notes: notes || "",
        status: "UPCOMING",
        organizationId: orgId,
      },
      include: { bike: true },
    });

    // Update bike to RENTED **only if startDate <= today**
    if (new Date(startDate) <= new Date()) {
      await prisma.bike.update({
        where: { id: bikeId },
        data: { status: "RENTED" },
      });
    }

    res.json(booking);
  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** Update booking */
export const updateBooking = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = req.params.id;

    const existing = await prisma.booking.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) return res.status(404).json({ error: "Booking not found" });

    const {
      customerName,
      phone,
      startDate,
      endDate,
      totalAmount,
      paidAmount,
      notes,
    } = req.body;

    // Check overlap when updating dates
    if (startDate || endDate) {
      const newStart = startDate ? new Date(startDate) : existing.startDate;
      const newEnd = endDate ? new Date(endDate) : existing.endDate;

      const overlap = await prisma.booking.findFirst({
        where: {
          bikeId: existing.bikeId,
          organizationId: orgId,
          id: { not: id },
          status: { in: ["ACTIVE", "UPCOMING"] },
          OR: [
            {
              startDate: { lte: newEnd },
              endDate: { gte: newStart },
            },
          ],
        },
      });

      if (overlap) {
        return res.status(400).json({
          error: "Bike already booked for selected date range",
          blockingBooking: overlap,
        });
      }
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        customerName,
        phone,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        paidAmount: paidAmount ? Number(paidAmount) : undefined,
        notes,
      },
    });

    // Auto-update bike status when editing
    await autoFixBikeStatus(existing.bikeId, orgId);

    res.json(updated);
  } catch (err) {
    console.error("Error updating booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** Mark returned */
export const markReturned = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = req.params.id;

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "RETURNED" },
    });

    // Auto-set bike AVAILABLE
    await prisma.bike.update({
      where: { id: booking.bikeId },
      data: { status: "AVAILABLE" },
    });

    res.json({ message: "Marked as returned", booking: updated });
  } catch (err) {
    console.error("Error marking returned:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** Delete booking */
export const deleteBooking = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = req.params.id;

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    await prisma.booking.delete({ where: { id } });

    // Auto-fix bike status after delete
    await autoFixBikeStatus(booking.bikeId, orgId);

    res.json({ message: "Booking deleted" });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};
