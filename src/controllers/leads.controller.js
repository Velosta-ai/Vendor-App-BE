import prisma from "../config/prisma.js";
import { validatePhone } from "../utils/validation.js";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  paginatedResponse,
  serverErrorResponse,
  ERROR_CODES,
} from "../utils/response.js";

/** CREATE LEAD */
export const createLead = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { phone, message, source } = req.body;

    if (!phone) {
      return errorResponse(res, "Phone number is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    // Validate and normalize phone
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.isValid) {
      return errorResponse(res, phoneValidation.error, ERROR_CODES.INVALID_PHONE, 400);
    }

    const lead = await prisma.lead.create({
      data: {
        phone: phoneValidation.normalized,
        message: message?.trim() || "",
        source: source || "manual",
        status: "new",
        organizationId: orgId,
      },
    });

    return successResponse(res, lead, "Lead created successfully", 201);
  } catch (err) {
    console.error("Lead create error:", err);
    return serverErrorResponse(res, err);
  }
};

/** GET ALL LEADS WITH PAGINATION */
export const getLeads = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const {
      status,
      source,
      search,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = { organizationId: orgId };

    if (status) {
      where.status = status;
    }

    if (source) {
      where.source = source;
    }

    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { message: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.lead.count({ where });

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip,
      take: limitNum,
    });

    return paginatedResponse(res, leads, total, pageNum, limitNum);
  } catch (err) {
    console.error("Lead fetch error:", err);
    return serverErrorResponse(res, err);
  }
};

/** GET LEAD BY ID */
export const getLeadById = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id: Number(id), organizationId: orgId },
    });

    if (!lead) {
      return notFoundResponse(res, "Lead");
    }

    return successResponse(res, lead);
  } catch (err) {
    console.error("Lead fetch error:", err);
    return serverErrorResponse(res, err);
  }
};

/** UPDATE LEAD STATUS */
export const updateLeadStatus = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return errorResponse(res, "Status is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    // Validate status
    const validStatuses = ["new", "contacted", "in_progress", "converted", "lost"];
    if (!validStatuses.includes(status)) {
      return errorResponse(
        res,
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Check lead exists and belongs to org
    const lead = await prisma.lead.findFirst({
      where: { id: Number(id), organizationId: orgId },
    });

    if (!lead) {
      return notFoundResponse(res, "Lead");
    }

    const updated = await prisma.lead.update({
      where: { id: Number(id) },
      data: { status },
    });

    return successResponse(res, updated, "Lead status updated");
  } catch (err) {
    console.error("Lead update error:", err);
    return serverErrorResponse(res, err);
  }
};

/** UPDATE LEAD */
export const updateLead = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;
    const { phone, message, source, status } = req.body;

    // Check lead exists and belongs to org
    const lead = await prisma.lead.findFirst({
      where: { id: Number(id), organizationId: orgId },
    });

    if (!lead) {
      return notFoundResponse(res, "Lead");
    }

    // Validate phone if provided
    let normalizedPhone = undefined;
    if (phone !== undefined) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.isValid) {
        return errorResponse(res, phoneValidation.error, ERROR_CODES.INVALID_PHONE, 400);
      }
      normalizedPhone = phoneValidation.normalized;
    }

    // Validate status if provided
    if (status) {
      const validStatuses = ["new", "contacted", "in_progress", "converted", "lost"];
      if (!validStatuses.includes(status)) {
        return errorResponse(
          res,
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          ERROR_CODES.VALIDATION_ERROR,
          400
        );
      }
    }

    const updated = await prisma.lead.update({
      where: { id: Number(id) },
      data: {
        ...(normalizedPhone && { phone: normalizedPhone }),
        ...(message !== undefined && { message: message?.trim() || "" }),
        ...(source !== undefined && { source }),
        ...(status !== undefined && { status }),
      },
    });

    return successResponse(res, updated, "Lead updated successfully");
  } catch (err) {
    console.error("Lead update error:", err);
    return serverErrorResponse(res, err);
  }
};

/** DELETE LEAD */
export const deleteLead = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    // Check lead exists and belongs to org
    const lead = await prisma.lead.findFirst({
      where: { id: Number(id), organizationId: orgId },
    });

    if (!lead) {
      return notFoundResponse(res, "Lead");
    }

    await prisma.lead.delete({
      where: { id: Number(id) },
    });

    return successResponse(res, null, "Lead deleted successfully");
  } catch (err) {
    console.error("Lead delete error:", err);
    return serverErrorResponse(res, err);
  }
};

/** CONVERT LEAD TO BOOKING */
export const convertLead = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;
    const { customerName, bikeId, startDate, endDate, totalAmount, paidAmount, notes } = req.body;

    // Check lead exists and belongs to org
    const lead = await prisma.lead.findFirst({
      where: { id: Number(id), organizationId: orgId },
    });

    if (!lead) {
      return notFoundResponse(res, "Lead");
    }

    if (lead.status === "converted") {
      return errorResponse(res, "Lead is already converted", "LEAD_ALREADY_CONVERTED", 400);
    }

    // Validate required booking fields
    if (!customerName || !bikeId || !startDate || !endDate) {
      return errorResponse(
        res,
        "Customer name, bike ID, start date and end date are required",
        ERROR_CODES.MISSING_FIELDS,
        400
      );
    }

    // Check bike exists and belongs to org
    const bike = await prisma.bike.findFirst({
      where: { id: bikeId, organizationId: orgId, isDeleted: false },
    });

    if (!bike) {
      return notFoundResponse(res, "Bike");
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        customerName: customerName.trim(),
        phone: lead.phone,
        bikeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalAmount: Number(totalAmount) || 0,
        paidAmount: Number(paidAmount) || 0,
        notes: notes?.trim() || "",
        status: new Date(startDate) <= new Date() ? "ACTIVE" : "UPCOMING",
        organizationId: orgId,
      },
      include: { bike: true },
    });

    // Update lead status
    await prisma.lead.update({
      where: { id: Number(id) },
      data: { status: "converted" },
    });

    return successResponse(
      res,
      {
        lead: { id: lead.id, status: "converted" },
        booking,
      },
      "Lead converted to booking successfully",
      201
    );
  } catch (err) {
    console.error("Lead conversion error:", err);
    return serverErrorResponse(res, err);
  }
};

/** GET LEAD STATS */
export const getLeadStats = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, newCount, contacted, inProgress, converted, lost, thisMonth] =
      await Promise.all([
        prisma.lead.count({ where: { organizationId: orgId } }),
        prisma.lead.count({ where: { organizationId: orgId, status: "new" } }),
        prisma.lead.count({ where: { organizationId: orgId, status: "contacted" } }),
        prisma.lead.count({ where: { organizationId: orgId, status: "in_progress" } }),
        prisma.lead.count({ where: { organizationId: orgId, status: "converted" } }),
        prisma.lead.count({ where: { organizationId: orgId, status: "lost" } }),
        prisma.lead.count({
          where: { organizationId: orgId, timestamp: { gte: monthStart } },
        }),
      ]);

    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : 0;

    return successResponse(res, {
      total,
      byStatus: {
        new: newCount,
        contacted,
        in_progress: inProgress,
        converted,
        lost,
      },
      thisMonth,
      conversionRate: parseFloat(conversionRate),
    });
  } catch (err) {
    console.error("Lead stats error:", err);
    return serverErrorResponse(res, err);
  }
};
