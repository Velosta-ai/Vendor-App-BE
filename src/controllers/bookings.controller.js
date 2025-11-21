// src/controllers/bookingsController.js
import prisma from "../config/prisma.js";

/** Helpers: day normalization & calculations */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const nextDay = (d) => {
  return new Date(startOfDay(d).getTime() + MS_PER_DAY);
};
const today = () => startOfDay(new Date());

/** Utility: calculate total rental days (inclusive) */
const calculateDays = (start, end) => {
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  // inclusive days (if start == end => 1 day)
  return Math.max(1, Math.floor((e - s) / MS_PER_DAY) + 1);
};

/**
 * Auto-fix bike status based on any ongoing (now) bookings.
 * If there is a booking that contains "now" -> RENTED
 * Otherwise AVAILABLE. Does not change bookings.
 */
const autoFixBikeStatus = async (bikeId, orgId) => {
  const now = new Date();

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
    try {
      await prisma.bike.update({
        where: { id: bikeId },
        data: { status: "RENTED" },
      });
    } catch (e) {
      // swallow DB update errors - we still return computed status
    }
    return "RENTED";
  }

  try {
    await prisma.bike.update({
      where: { id: bikeId },
      data: { status: "AVAILABLE" },
    });
  } catch (e) {}
  return "AVAILABLE";
};

/**
 * computeAvailability:
 * - merges overlapping/contiguous bookings (for blocking chain)
 * - returns whether bike is available right now (no current booking)
 * - returns nextAvailableDate = day after the blocking chain end if there's a chain that blocks now
 * - returns returnInDays and blockingBookings (merged chain)
 */
const computeAvailability = async (bikeId, orgId) => {
  const now = new Date();

  // fetch bookings that end today or later and are ACTIVE/UPCOMING
  const bookings = await prisma.booking.findMany({
    where: {
      bikeId,
      organizationId: orgId,
      status: { in: ["ACTIVE", "UPCOMING"] },
      endDate: { gte: startOfDay(now) }, // any booking that can block now or future
    },
    orderBy: { startDate: "asc" },
  });

  if (!bookings || bookings.length === 0) {
    return {
      bikeId,
      isAvailableNow: true,
      nextAvailableDate: null,
      currentBooking: null,
      returnInDays: 0,
      blockingBookings: [],
    };
  }

  // convert to normalized ranges (start = startOfDay, end = endOfDay)
  const ranges = bookings.map((b) => ({
    id: b.id,
    start: startOfDay(b.startDate),
    end: endOfDay(b.endDate),
    raw: b,
  }));

  // Merge ranges that are overlapping / contiguous to compute continuous blocking chains.
  // We'll build all merged chains (array of {start,end,ids}), then find the first chain that either:
  // - intersects now OR
  // - is the earliest upcoming chain (first merged chain)
  const merged = [];
  for (const r of ranges) {
    if (merged.length === 0) {
      merged.push({ start: r.start, end: r.end, ids: [r.id], raws: [r.raw] });
      continue;
    }
    const last = merged[merged.length - 1];
    // if r.start is <= last.end + 1ms (overlap/contiguous) -> merge
    if (r.start.getTime() <= last.end.getTime() + 1) {
      if (r.end > last.end) last.end = r.end;
      last.ids.push(r.id);
      last.raws.push(r.raw);
    } else {
      // non-overlapping -> start new chain
      merged.push({ start: r.start, end: r.end, ids: [r.id], raws: [r.raw] });
    }
  }

  // find the chain of interest:
  // prefer chain that contains 'now' (start <= now <= end), otherwise pick first merged chain
  let chosenChain = merged.find((c) => c.start <= now && c.end >= now);
  if (!chosenChain) chosenChain = merged[0];

  // currentBooking: if any booking actually covers now (single booking)
  const currentBooking = bookings.find(
    (b) => startOfDay(b.startDate) <= now && endOfDay(b.endDate) >= now
  );

  const chainEnd = chosenChain.end;
  const nextAvailableDate = chainEnd > now ? nextDay(chainEnd) : null;
  const returnInDays = nextAvailableDate
    ? Math.ceil((startOfDay(nextAvailableDate) - startOfDay(now)) / MS_PER_DAY)
    : 0;

  return {
    bikeId,
    isAvailableNow: !currentBooking, // bike available if no current booking
    nextAvailableDate: nextAvailableDate
      ? nextAvailableDate.toISOString()
      : null,
    currentBooking: currentBooking
      ? {
          id: currentBooking.id,
          customerName: currentBooking.customerName,
          startDate: currentBooking.startDate,
          endDate: currentBooking.endDate,
        }
      : null,
    returnInDays,
    // blocking bookings: return the bookings that form the chosen chain (for UI)
    blockingBookings: chosenChain.raws.map((b) => ({
      id: b.id,
      startDate: startOfDay(b.startDate).toISOString(),
      endDate: endOfDay(b.endDate).toISOString(),
    })),
  };
};

/** GET ALL BOOKINGS (ORG SCOPED) */
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

/** GET BOOKING BY ID (ORG SCOPED) */
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

/** CREATE BOOKING (ORG SCOPED) */
export const createBooking = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const {
      customerName,
      phone,
      bikeId,
      startDate: rawStart,
      endDate: rawEnd,
      totalAmount,
      paidAmount,
      notes,
    } = req.body;

    if (!customerName || !phone || !bikeId || !rawStart || !rawEnd) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // normalize dates to day boundaries
    const startDate = startOfDay(new Date(rawStart));
    const endDate = endOfDay(new Date(rawEnd));

    // disallow backdates (start before today)
    if (startDate < today()) {
      return res
        .status(400)
        .json({ error: "Start date cannot be in the past" });
    }
    if (endDate < startDate) {
      return res
        .status(400)
        .json({ error: "End date must be after start date" });
    }

    // Check bike belongs to org
    const bike = await prisma.bike.findFirst({
      where: { id: bikeId, organizationId: orgId },
    });
    if (!bike) return res.status(400).json({ error: "Bike not found" });

    // Auto-fix bike status (best-effort)
    await autoFixBikeStatus(bikeId, orgId);

    // Overlap check (inclusive) — exclude RETURNED bookings
    const overlap = await prisma.booking.findFirst({
      where: {
        bikeId,
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
      },
      orderBy: { startDate: "asc" },
    });

    if (overlap) {
      // compute availability to provide helpful info to frontend
      const availability = await computeAvailability(bikeId, orgId);
      return res.status(400).json({
        error: "Bike already booked for selected date range",
        blockingBooking: overlap,
        nextAvailableDate: availability.nextAvailableDate,
        returnInDays: availability.returnInDays,
        blockingBookings: availability.blockingBookings,
      });
    }

    // create booking
    const days = calculateDays(startDate, endDate);
    const autoAmount = days * (bike.dailyRate || 0);

    const booking = await prisma.booking.create({
      data: {
        customerName,
        phone,
        bikeId,
        startDate,
        endDate,
        totalAmount: Number(totalAmount ?? autoAmount),
        paidAmount: Number(paidAmount ?? 0),
        notes: notes ?? "",
        status: startDate <= new Date() ? "ACTIVE" : "UPCOMING",
        organizationId: orgId,
      },
      include: { bike: true },
    });

    // If booking starts today or earlier today -> set bike RENTED
    if (startDate <= new Date()) {
      await prisma.bike.update({
        where: { id: bikeId },
        data: { status: "RENTED" },
      });
    } else {
      await autoFixBikeStatus(bikeId, orgId);
    }

    res.json(booking);
  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** UPDATE BOOKING (ORG SCOPED) */
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
      startDate: rawStart,
      endDate: rawEnd,
      totalAmount,
      paidAmount,
      notes,
    } = req.body;

    // normalize provided dates, fallback to existing
    let newStart = rawStart
      ? startOfDay(new Date(rawStart))
      : startOfDay(existing.startDate);
    let newEnd = rawEnd
      ? endOfDay(new Date(rawEnd))
      : endOfDay(existing.endDate);

    if (newStart < today()) {
      return res
        .status(400)
        .json({ error: "Start date cannot be in the past" });
    }
    if (newEnd < newStart) {
      return res
        .status(400)
        .json({ error: "End date must be after start date" });
    }

    // Overlap check excluding this booking
    const overlap = await prisma.booking.findFirst({
      where: {
        bikeId: existing.bikeId,
        organizationId: orgId,
        id: { not: id },
        status: { in: ["ACTIVE", "UPCOMING"] },
        AND: [{ startDate: { lte: newEnd } }, { endDate: { gte: newStart } }],
      },
    });

    if (overlap) {
      const availability = await computeAvailability(existing.bikeId, orgId);
      return res.status(400).json({
        error: "Bike already booked for selected date range",
        blockingBooking: overlap,
        nextAvailableDate: availability.nextAvailableDate,
        returnInDays: availability.returnInDays,
      });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        customerName,
        phone,
        startDate: rawStart ? newStart : undefined,
        endDate: rawEnd ? newEnd : undefined,
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        paidAmount: paidAmount ? Number(paidAmount) : undefined,
        notes,
      },
    });

    // Recompute bike status after change
    await autoFixBikeStatus(existing.bikeId, orgId);

    res.json(updated);
  } catch (err) {
    console.error("Error updating booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** MARK AS RETURNED */
export const markReturned = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = req.params.id;

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const now = new Date();

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: "RETURNED",
        endDate: now,
      },
    });

    await autoFixBikeStatus(booking.bikeId, orgId);

    res.json({ message: "Marked as returned", booking: updatedBooking });
  } catch (err) {
    console.error("Error marking returned:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** DELETE BOOKING */
export const deleteBooking = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = req.params.id;

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    await prisma.booking.delete({ where: { id } });

    await autoFixBikeStatus(booking.bikeId, orgId);

    res.json({ message: "Booking deleted" });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** GET BIKE AVAILABILITY (exposes computeAvailability) */
export const getBikeAvailability = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const bikeId = req.params.id;

    const bike = await prisma.bike.findUnique({ where: { id: bikeId } });
    if (!bike || bike.organizationId !== orgId) {
      return res.status(404).json({ error: "Bike not found" });
    }

    const availability = await computeAvailability(bikeId, orgId);

    // best-effort align DB status
    await autoFixBikeStatus(bikeId, orgId);

    res.json(availability);
  } catch (err) {
    console.error("getBikeAvailability error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
