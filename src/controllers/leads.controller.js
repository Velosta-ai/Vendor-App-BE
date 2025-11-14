import prisma from "../config/prisma.js";

export const createLead = async (req, res) => {
  try {
    console.log("hii");
    const { phone, message, source } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const lead = await prisma.lead.create({
      data: {
        phone,
        message: message || "",
        source: source || "manual",
        status: "new",
      },
    });

    return res.status(201).json(lead);
  } catch (err) {
    console.error("Lead create error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** GET ALL LEADS */
export const getLeads = async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { timestamp: "desc" },
    });

    return res.json(leads);
  } catch (err) {
    console.error("Lead fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const updated = await prisma.lead.update({
      where: { id: Number(id) },
      data: { status },
    });

    return res.json(updated);
  } catch (err) {
    console.error("Lead update error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** DELETE LEAD */
export const deleteLead = async (req, res) => {
  try {
    await prisma.lead.delete({
      where: { id: Number(req.params.id) },
    });

    return res.json({ message: "Lead deleted" });
  } catch (err) {
    console.error("Lead delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
