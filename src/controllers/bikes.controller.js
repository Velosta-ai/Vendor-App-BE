import prisma from "../config/prisma.js";

export const getBikes = async (req, res) => {
  try {
    const bikes = await prisma.bike.findMany({
      include: { bookings: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(bikes);
  } catch (err) {
    console.error("Error fetching bikes:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const getBikeById = async (req, res) => {
  try {
    const bike = await prisma.bike.findUnique({
      where: { id: req.params.id },
      include: { bookings: true },
    });

    if (!bike) return res.status(404).json({ error: "Bike not found" });

    res.json(bike);
  } catch (err) {
    console.error("Error fetching bike:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const createBike = async (req, res) => {
  try {
    const { name, model, registrationNumber, year, dailyRate } = req.body;

    if (!name || !dailyRate)
      return res.status(400).json({ error: "Name & dailyRate required" });

    const bike = await prisma.bike.create({
      data: {
        name,
        model: model || null,
        registrationNumber,
        year: year ? Number(year) : null,
        dailyRate: Number(dailyRate),
        status: "AVAILABLE",
      },
    });

    res.json(bike);
  } catch (err) {
    console.error("Error creating bike:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const updateBike = async (req, res) => {
  try {
    const { id } = req.params;
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

    res.json(bike);
  } catch (err) {
    console.error("Error updating bike:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const updateBikeStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const bike = await prisma.bike.update({
      where: { id },
      status: req.body.status.toUpperCase(),
    });

    res.json(bike);
  } catch (err) {
    console.error("Error updating bike status:", err);
    res.status(500).json({ error: "Server error" });
  }
};
