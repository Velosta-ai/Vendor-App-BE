import prisma from "../config/prisma.js";

export const createLead = async (req, res) => {
  try {
    const orgId = req.organizationId;
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
        organizationId: orgId,
      },
    });

    return res.status(201).json(lead);
  } catch (err) {
    console.error("Lead create error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/** GET ALL LEADS (ORG SCOPED) */
export const getLeads = async (req, res) => {
  try {
    const orgId = req.organizationId;

    const leads = await prisma.lead.findMany({
      where: { organizationId: orgId },
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
    const orgId = req.organizationId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // Verify lead belongs to organization
    const lead = await prisma.lead.findFirst({
      where: { id: Number(id), organizationId: orgId },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
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

/** DELETE LEAD (ORG SCOPED) */
export const deleteLead = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = Number(req.params.id);

    // Verify lead belongs to organization
    const lead = await prisma.lead.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    await prisma.lead.delete({
      where: { id },
    });

    return res.json({ message: "Lead deleted" });
  } catch (err) {
    console.error("Lead delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
