import prisma from "../config/prisma.js";

const calculateDays = (start, end) => {
  return Math.max(
    1,
    Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24))
  );
};

export const getBookings = async (req, res) => {
  try {
    const { status } = req.query;

    const bookings = await prisma.booking.findMany({
      where: status ? { status } : {},
      include: {
        bike: true,
      },
      orderBy: { startDate: "desc" },
    });

    res.json(bookings);
  } catch (err) {
    console.error("Error loading bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { bike: true },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    res.json(booking);
  } catch (err) {
    console.error("Error fetching booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const createBooking = async (req, res) => {
  try {
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

    if (!customerName || !phone || !bikeId || !startDate || !endDate)
      return res.status(400).json({ error: "Missing required fields" });

    const bike = await prisma.bike.findUnique({
      where: { id: bikeId },
    });

    if (!bike) return res.status(400).json({ error: "Bike not found" });

    if (bike.status !== "AVAILABLE")
      return res.status(400).json({ error: "Bike is NOT available" });

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
        status: "ACTIVE",
      },
      include: { bike: true },
    });

    await prisma.bike.update({
      where: { id: bikeId },
      data: {
        status: "RENTED",
      },
    });

    res.json(booking);
  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      customerName,
      phone,
      startDate,
      endDate,
      totalAmount,
      paidAmount,
      notes,
    } = req.body;

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        customerName,
        phone,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalAmount: Number(totalAmount),
        paidAmount: Number(paidAmount),
        notes,
      },
    });

    res.json(booking);
  } catch (err) {
    console.error("Error updating booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const markReturned = async (req, res) => {
  try {
    const id = req.params.id;

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        status: "RETURNED",
      },
    });

    await prisma.bike.update({
      where: { id: booking.bikeId },
      data: {
        status: "AVAILABLE",
      },
    });

    res.json({ message: "Marked as returned", booking });
  } catch (err) {
    console.error("Error marking returned:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const deleteBooking = async (req, res) => {
  try {
    const id = req.params.id;

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) return res.status(404).json({ error: "Not found" });

    if (booking.status === "ACTIVE") {
      await prisma.bike.update({
        where: { id: booking.bikeId },
        data: {
          status: "AVAILABLE",
        },
      });
    }

    await prisma.booking.delete({ where: { id } });

    res.json({ message: "Booking deleted" });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ error: "Server error" });
  }
};
