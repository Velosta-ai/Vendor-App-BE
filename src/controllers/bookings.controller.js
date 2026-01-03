// src/controllers/bookingsController.js
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

  // A bike is RENTED if it has ANY booking that:
  // - Has started (startDate <= now)
  // - Has NOT been returned (status IN ["ACTIVE", "UPCOMING"])
  // Note: endDate doesn't matter - overdue bookings still mean the bike is RENTED until marked as RETURNED
  const activeBooking = await prisma.booking.findFirst({
    where: {
      bikeId,
      organizationId: orgId,
      status: { in: ["ACTIVE", "UPCOMING"] },
      isDeleted: false,
      startDate: { lte: now },
      // Removed endDate check - overdue bookings (endDate < now) still mean bike is RENTED
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
 * - Finds all existing bookings for the bike
 * - Determines if bike is available NOW
 * - Finds the next TRULY available date (considering ALL existing bookings)
 * - Returns current booking info and blocking bookings
 */
const computeAvailability = async (bikeId, orgId) => {
  const now = new Date();
  const todayStart = startOfDay(now);

  // Fetch all active/upcoming bookings for this bike
  const bookings = await prisma.booking.findMany({
    where: {
      bikeId,
      organizationId: orgId,
      status: { in: ["ACTIVE", "UPCOMING"] },
      isDeleted: false,
      endDate: { gte: todayStart }, // relevant bookings
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

  // Find the current booking (one that covers today)
  const currentBooking = bookings.find((b) => {
    const bStart = startOfDay(b.startDate);
    const bEnd = endOfDay(b.endDate);
    return bStart <= now && bEnd >= now;
  });

  const isAvailableNow = !currentBooking;

  // If there's a current booking, find when it ends and if there's a gap after it
  let nextAvailableDate = null;
  let returnInDays = 0;
  let blockingBookings = [];

  if (currentBooking) {
    // Bike is currently rented
    blockingBookings = [currentBooking];
    
    // Start looking for gaps - bike is available FROM the end date (same-day handover supported)
    // If booking ends Jan 5, bike is available starting Jan 5
    let checkDate = startOfDay(currentBooking.endDate);
    
    // Check if there are back-to-back bookings after the current one
    // Find the first available gap
    let foundGap = false;
    let iterations = 0;
    const maxIterations = 365; // Safety limit - don't look more than a year ahead
    
    while (!foundGap && iterations < maxIterations) {
      iterations++;
      
      // Check if checkDate falls within any existing booking
      // With same-day handover: a date is blocked if a booking STARTS on or before it
      // AND ENDS AFTER it (not on the same day)
      const conflictingBooking = bookings.find((b) => {
        if (b.id === currentBooking.id) return false; // Skip current booking
        const bStart = startOfDay(b.startDate);
        const bEnd = startOfDay(b.endDate); // Compare start of end day
        // Blocked if booking starts on/before checkDate AND ends AFTER checkDate
        return bStart <= checkDate && bEnd > checkDate;
      });
      
      if (conflictingBooking) {
        // This date is also booked, move to end date of this booking (same-day handover)
        blockingBookings.push(conflictingBooking);
        checkDate = startOfDay(conflictingBooking.endDate);
      } else {
        // Found a gap!
        foundGap = true;
        nextAvailableDate = checkDate;
      }
    }
    
    if (nextAvailableDate) {
      returnInDays = Math.max(1, Math.ceil((startOfDay(nextAvailableDate) - todayStart) / MS_PER_DAY));
    }
  }

  return {
    bikeId,
    isAvailableNow,
    nextAvailableDate: nextAvailableDate ? nextAvailableDate.toISOString() : null,
    currentBooking: currentBooking
      ? {
          id: currentBooking.id,
          customerName: currentBooking.customerName,
          startDate: currentBooking.startDate,
          endDate: currentBooking.endDate,
        }
      : null,
    returnInDays,
    blockingBookings: blockingBookings.map((b) => ({
      id: b.id,
      customerName: b.customerName,
      startDate: b.startDate,
      endDate: b.endDate,
    })),
  };
};

/** GET ALL BOOKINGS (ORG SCOPED) - WITH PAGINATION */
export const getBookings = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const {
      status,
      search,
      bikeId,
      dateFrom,
      dateTo,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {
      organizationId: orgId,
      isDeleted: false,
    };

    if (status) {
      where.status = status;
    }

    if (bikeId) {
      where.bikeId = bikeId;
    }

    if (dateFrom || dateTo) {
      where.AND = [];
      if (dateFrom) {
        where.AND.push({ startDate: { gte: new Date(dateFrom) } });
      }
      if (dateTo) {
        where.AND.push({ endDate: { lte: new Date(dateTo) } });
      }
    }

    // Search by customer name or phone
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    // Get total count
    const total = await prisma.booking.count({ where });

    // Get paginated bookings
    const bookings = await prisma.booking.findMany({
      where,
      include: { bike: true },
      orderBy: { startDate: "desc" },
      skip,
      take: limitNum,
    });

    return paginatedResponse(res, bookings, total, pageNum, limitNum);
  } catch (err) {
    console.error("Error loading bookings:", err);
    return serverErrorResponse(res, err);
  }
};

/** GET BOOKING BY ID (ORG SCOPED) */
export const getBookingById = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;

    // Validate UUID format
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return errorResponse(res, "Invalid booking ID format", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        organizationId: orgId,
        isDeleted: false,
      },
      include: {
        bike: true,
        payments: {
          orderBy: { date: "desc" },
        },
      },
    });

    if (!booking) {
      return notFoundResponse(res, "Booking");
    }

    return successResponse(res, booking);
  } catch (err) {
    console.error("Error retrieving booking:", err);
    return serverErrorResponse(res, err);
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
      paymentMethod,
      paymentNotes,
    } = req.body;

    // Validate required fields
    if (!customerName || !phone || !bikeId || !rawStart || !rawEnd) {
      return errorResponse(res, "Missing required fields", ERROR_CODES.MISSING_FIELDS, 400);
    }

    // Validate and normalize phone
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.isValid) {
      return errorResponse(res, phoneValidation.error, ERROR_CODES.INVALID_PHONE, 400);
    }
    const normalizedPhone = phoneValidation.normalized;

    // normalize dates to day boundaries
    const startDate = startOfDay(new Date(rawStart));
    const endDate = endOfDay(new Date(rawEnd));

    // disallow backdates (start before today)
    if (startDate < today()) {
      return errorResponse(res, "Start date cannot be in the past", ERROR_CODES.PAST_DATE, 400);
    }
    if (endDate < startDate) {
      return errorResponse(
        res,
        "End date must be after start date",
        ERROR_CODES.INVALID_DATE_RANGE,
        400
      );
    }

    // Check bike belongs to org and is not deleted
    const bike = await prisma.bike.findFirst({
      where: { id: bikeId, organizationId: orgId, isDeleted: false },
    });
    if (!bike) {
      return notFoundResponse(res, "Bike");
    }

    // Check if bike is in maintenance
    if (bike.status === "MAINTENANCE") {
      return errorResponse(
        res,
        "Bike is currently in maintenance",
        ERROR_CODES.BIKE_IN_MAINTENANCE,
        400
      );
    }

    // Auto-fix bike status (best-effort)
    await autoFixBikeStatus(bikeId, orgId);

    // Overlap check with SAME-DAY HANDOVER support:
    // - Booking A: Jan 1-5 (ends Jan 5)
    // - Booking B: Jan 5-10 (starts Jan 5) 
    // These should be ALLOWED (same-day handover)
    //
    // The challenge: dates are stored with times (00:00:00 for start, 23:59:59 for end)
    // and converted to UTC. So "Jan 5 end" in IST might be "Jan 5 18:30 UTC"
    // and "Jan 5 start" in IST might be "Jan 4 18:30 UTC".
    //
    // Solution: Compare existing.endDate against nextDay(new.startDate)
    // If existing ends Jan 5 and new starts Jan 5:
    //   - existing.endDate = Jan 5 23:59:59 local
    //   - nextDay(new.startDate) = Jan 6 00:00:00 local
    //   - Jan 5 < Jan 6, so no overlap ✓
    const nextDayOfNewStart = nextDay(startDate);
    
    const overlap = await prisma.booking.findFirst({
      where: {
        bikeId,
        organizationId: orgId,
        status: { in: ["ACTIVE", "UPCOMING"] },
        isDeleted: false,
        AND: [
          { startDate: { lte: endDate } },       // existing starts before or when new ends
          { endDate: { gte: nextDayOfNewStart } }, // existing ends ON or AFTER the day AFTER new starts
        ],
      },
      orderBy: { startDate: "asc" },
    });
    
    // Debug logging for overlap detection
    if (overlap) {
      console.log("[Booking] Overlap detected:", {
        newBooking: { 
          startDate: startDate.toISOString(), 
          endDate: endDate.toISOString(),
          nextDayOfStart: nextDayOfNewStart.toISOString()
        },
        existingBooking: { 
          id: overlap.id,
          startDate: overlap.startDate, 
          endDate: overlap.endDate 
        },
      });
    }

    if (overlap) {
      // compute availability to provide helpful info to frontend
      const availability = await computeAvailability(bikeId, orgId);
      return res.status(400).json({
        success: false,
        error: "Bike not available for selected dates",
        code: ERROR_CODES.BOOKING_OVERLAP,
        nextAvailableDate: availability.nextAvailableDate,
        details: {
          returnInDays: availability.returnInDays,
          blockingBooking: {
            id: overlap.id,
            customerName: overlap.customerName,
            startDate: overlap.startDate,
            endDate: overlap.endDate,
          },
          blockingBookings: availability.blockingBookings,
        },
      });
    }

    // create booking
    const days = calculateDays(startDate, endDate);
    const autoAmount = days * (bike.dailyRate || 0);

    const booking = await prisma.booking.create({
      data: {
        customerName: customerName.trim(),
        phone: normalizedPhone,
        bikeId,
        startDate,
        endDate,
        totalAmount: Number(totalAmount ?? autoAmount),
        paidAmount: Number(paidAmount ?? 0),
        notes: notes?.trim() ?? "",
        paymentMethod: paymentMethod || null,
        paymentNotes: paymentNotes?.trim() || null,
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

    return successResponse(res, booking, "Booking created successfully", 201);
  } catch (err) {
    console.error("Error creating booking:", err);
    return serverErrorResponse(res, err);
  }
};

/** UPDATE BOOKING (ORG SCOPED) */
export const updateBooking = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = req.params.id;

    const existing = await prisma.booking.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
    });

    if (!existing) {
      return notFoundResponse(res, "Booking");
    }

    const {
      customerName,
      phone,
      startDate: rawStart,
      endDate: rawEnd,
      totalAmount,
      paidAmount,
      notes,
      paymentMethod,
      paymentNotes,
    } = req.body;

    // Validate and normalize phone if provided
    let normalizedPhone = undefined;
    if (phone !== undefined) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.isValid) {
        return errorResponse(res, phoneValidation.error, ERROR_CODES.INVALID_PHONE, 400);
      }
      normalizedPhone = phoneValidation.normalized;
    }

    // Only validate dates if they're being updated
    const isUpdatingDates = rawStart !== undefined || rawEnd !== undefined;
    let newStart = existing.startDate;
    let newEnd = existing.endDate;
    let datesChanged = false;

    if (isUpdatingDates) {
      // normalize provided dates, fallback to existing for the one not provided
      const proposedStart = rawStart
        ? startOfDay(new Date(rawStart))
        : startOfDay(existing.startDate);
      const proposedEnd = rawEnd ? endOfDay(new Date(rawEnd)) : endOfDay(existing.endDate);

      // Check if dates actually changed
      datesChanged = 
        (rawStart !== undefined && proposedStart.getTime() !== startOfDay(existing.startDate).getTime()) ||
        (rawEnd !== undefined && proposedEnd.getTime() !== endOfDay(existing.endDate).getTime());

      // Only validate if dates are actually being changed
      if (datesChanged) {
        newStart = proposedStart;
        newEnd = proposedEnd;

        // Only validate "cannot be in the past" if start date is being changed to a NEW past date
        // Allow keeping existing past dates (for existing bookings)
        if (rawStart !== undefined) {
          const existingStartDay = startOfDay(existing.startDate);
          const isChangingStartDate = proposedStart.getTime() !== existingStartDay.getTime();
          
          // Only block if changing to a past date (not if keeping existing past date)
          if (isChangingStartDate && proposedStart < today()) {
            return errorResponse(res, "Start date cannot be in the past", ERROR_CODES.PAST_DATE, 400);
          }
        }
        
        // Validate date range
        if (newEnd < newStart) {
          return errorResponse(
            res,
            "End date must be after start date",
            ERROR_CODES.INVALID_DATE_RANGE,
            400
          );
        }

        // Overlap check only if dates are actually being changed
        // Same-day handover supported: compare against nextDay of new start
        const nextDayOfNewStart = nextDay(newStart);
        const overlap = await prisma.booking.findFirst({
          where: {
            bikeId: existing.bikeId,
            organizationId: orgId,
            id: { not: id },
            status: { in: ["ACTIVE", "UPCOMING"] },
            isDeleted: false,
            AND: [
              { startDate: { lte: newEnd } },
              { endDate: { gte: nextDayOfNewStart } },
            ],
          },
        });

        if (overlap) {
          const availability = await computeAvailability(existing.bikeId, orgId);
          return res.status(400).json({
            success: false,
            error: "Bike not available for selected dates",
            code: ERROR_CODES.BOOKING_OVERLAP,
            nextAvailableDate: availability.nextAvailableDate,
            details: {
              returnInDays: availability.returnInDays,
            },
          });
        }
      } else {
        // Dates provided but unchanged - use existing dates
        newStart = existing.startDate;
        newEnd = existing.endDate;
      }
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        ...(customerName && { customerName: customerName.trim() }),
        ...(normalizedPhone && { phone: normalizedPhone }),
        ...(rawStart && { startDate: newStart }),
        ...(rawEnd && { endDate: newEnd }),
        ...(totalAmount !== undefined && { totalAmount: Number(totalAmount) }),
        ...(paidAmount !== undefined && { paidAmount: Number(paidAmount) }),
        ...(notes !== undefined && { notes: notes?.trim() || "" }),
        ...(paymentMethod !== undefined && { paymentMethod }),
        ...(paymentNotes !== undefined && { paymentNotes: paymentNotes?.trim() || null }),
      },
      include: { bike: true },
    });

    // Recompute bike status after change
    await autoFixBikeStatus(existing.bikeId, orgId);

    return successResponse(res, updated, "Booking updated successfully");
  } catch (err) {
    console.error("Error updating booking:", err);
    return serverErrorResponse(res, err);
  }
};

/** DELIVER BIKE - Record handover details */
export const deliverBike = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const accountId = req.accountId;
    const id = req.params.id;
    const {
      helmetsGiven,
      fuelLevel,
      odometerReading,
      existingDamages,
      idVerified,
      securityDeposit,
      // Document URLs (uploaded via /api/upload/image)
      customerIdFront,
      customerIdBack,
      customerPhoto,
      bikePhotos, // Array of URLs
    } = req.body;

    // Validate required fields
    if (helmetsGiven === undefined || !fuelLevel || odometerReading === undefined) {
      return errorResponse(
        res,
        "Helmets count, fuel level, and odometer reading are required",
        ERROR_CODES.MISSING_FIELDS,
        400
      );
    }

    // Validate fuel level enum
    const validFuelLevels = ["FULL", "THREE_QUARTER", "HALF", "QUARTER", "LOW"];
    if (!validFuelLevels.includes(fuelLevel)) {
      return errorResponse(
        res,
        "Invalid fuel level. Must be one of: FULL, THREE_QUARTER, HALF, QUARTER, LOW",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
      include: { bike: true },
    });

    if (!booking) {
      return notFoundResponse(res, "Booking");
    }

    // Check if booking is already delivered
    if (booking.deliveredAt) {
      return errorResponse(
        res,
        "Bike has already been delivered for this booking",
        ERROR_CODES.ALREADY_DELIVERED,
        400
      );
    }

    // Check if booking is in valid state for delivery (UPCOMING or ACTIVE without delivery)
    if (booking.status === "RETURNED" || booking.status === "CANCELLED") {
      return errorResponse(
        res,
        "Cannot deliver bike for a returned or cancelled booking",
        ERROR_CODES.INVALID_STATUS,
        400
      );
    }

    const now = new Date();

    // Update booking with delivery details
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        helmetsGiven: Number(helmetsGiven),
        fuelLevelStart: fuelLevel,
        odometerStart: Number(odometerReading),
        existingDamages: existingDamages?.trim() || null,
        deliveredAt: now,
        deliveredById: accountId,
        idVerified: Boolean(idVerified),
        securityDeposit: securityDeposit ? Number(securityDeposit) : null,
        status: "ACTIVE", // Automatically set to ACTIVE on delivery
        // Document URLs
        customerIdFront: customerIdFront || null,
        customerIdBack: customerIdBack || null,
        customerPhoto: customerPhoto || null,
        bikePhotosStart: Array.isArray(bikePhotos) ? bikePhotos : [],
      },
      include: { bike: true },
    });

    // Update bike status to RENTED
    await prisma.bike.update({
      where: { id: booking.bikeId },
      data: { status: "RENTED" },
    });

    return successResponse(
      res,
      updatedBooking,
      "Bike delivered successfully"
    );
  } catch (err) {
    console.error("Error delivering bike:", err);
    return serverErrorResponse(res, err);
  }
};

/** MARK AS RETURNED - With return details */
export const markReturned = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const accountId = req.accountId;
    const id = req.params.id;
    const { 
      paidAmount: additionalPaidAmount,
      finesAmount,
      finesNotes,
      // New return details
      helmetsReturned,
      fuelLevel,
      odometerReading,
      newDamages,
      fuelCharge,
      damageCharge,
      extraKmsCharge,
      lateFee,
    } = req.body;

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
      include: { bike: true },
    });

    if (!booking) {
      return notFoundResponse(res, "Booking");
    }

    const now = new Date();
    const originalEndDate = new Date(booking.endDate);
    const originalEndDay = startOfDay(originalEndDate);
    const returnDay = startOfDay(now);

    // Calculate overdue days: if return date is after original end date
    const overdueDays = returnDay > originalEndDay 
      ? Math.floor((returnDay - originalEndDay) / MS_PER_DAY)
      : 0;

    // Calculate overdue fee (overdue days * daily rate)
    const overdueFee = overdueDays > 0 
      ? overdueDays * (booking.bike?.dailyRate || 0)
      : 0;

    // Calculate fines amount (optional)
    const fines = finesAmount ? Number(finesAmount) : 0;

    // Calculate extra charges from return details
    const fuelChargeAmount = fuelCharge ? Number(fuelCharge) : 0;
    const damageChargeAmount = damageCharge ? Number(damageCharge) : 0;
    const extraKmsChargeAmount = extraKmsCharge ? Number(extraKmsCharge) : 0;
    const lateFeeAmount = lateFee ? Number(lateFee) : overdueFee;

    // Calculate new total amount (original + all charges)
    const originalTotal = booking.totalAmount || 0;
    const totalExtraCharges = fuelChargeAmount + damageChargeAmount + extraKmsChargeAmount + lateFeeAmount + fines;
    const newTotalAmount = originalTotal + totalExtraCharges;

    // Calculate new paid amount (existing + additional payment)
    const existingPaid = booking.paidAmount || 0;
    const additionalPaid = additionalPaidAmount ? Number(additionalPaidAmount) : 0;
    const newPaidAmount = existingPaid + additionalPaid;

    // Combine existing notes with fines notes if provided
    const existingNotes = booking.notes || "";
    const finesNotesText = finesNotes?.trim() || "";
    const updatedNotes = finesNotesText 
      ? `${existingNotes ? existingNotes + "\n\n" : ""}Fines/Damages: ${finesNotesText} (₹${fines.toFixed(2)})`
      : existingNotes;

    // Validate fuel level if provided
    const validFuelLevels = ["FULL", "THREE_QUARTER", "HALF", "QUARTER", "LOW"];
    if (fuelLevel && !validFuelLevels.includes(fuelLevel)) {
      return errorResponse(
        res,
        "Invalid fuel level. Must be one of: FULL, THREE_QUARTER, HALF, QUARTER, LOW",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Calculate KMs driven if both odometer readings exist
    const kmsUsed = (odometerReading && booking.odometerStart) 
      ? Number(odometerReading) - booking.odometerStart 
      : null;

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: "RETURNED",
        endDate: now,
        totalAmount: newTotalAmount,
        paidAmount: newPaidAmount,
        notes: updatedNotes,
        // Return details
        helmetsReturned: helmetsReturned !== undefined ? Number(helmetsReturned) : booking.helmetsGiven,
        fuelLevelEnd: fuelLevel || null,
        odometerEnd: odometerReading ? Number(odometerReading) : null,
        newDamages: newDamages?.trim() || null,
        returnedAt: now,
        receivedById: accountId,
        fuelCharge: fuelChargeAmount || null,
        damageCharge: damageChargeAmount || null,
        extraKmsCharge: extraKmsChargeAmount || null,
        lateFee: lateFeeAmount || null,
      },
      include: { bike: true },
    });

    await autoFixBikeStatus(booking.bikeId, orgId);

    // Return updated bike status as well
    const updatedBike = await prisma.bike.findUnique({
      where: { id: booking.bikeId },
    });

    return successResponse(
      res,
      {
        booking: updatedBooking,
        bike: updatedBike,
        overdueDays,
        overdueFee: lateFeeAmount,
        finesAmount: fines,
        fuelCharge: fuelChargeAmount,
        damageCharge: damageChargeAmount,
        extraKmsCharge: extraKmsChargeAmount,
        kmsUsed,
        originalTotalAmount: originalTotal,
        newTotalAmount,
        totalExtraCharges,
      },
      "Booking marked as returned"
    );
  } catch (err) {
    console.error("Error marking returned:", err);
    return serverErrorResponse(res, err);
  }
};

/** BULK MARK AS RETURNED */
export const bulkMarkReturned = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { bookingIds } = req.body;

    if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
      return errorResponse(res, "Booking IDs array is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const now = new Date();
    const results = [];
    const errors = [];

    for (const id of bookingIds) {
      try {
        const booking = await prisma.booking.findFirst({
          where: { id, organizationId: orgId, isDeleted: false },
        });

        if (!booking) {
          errors.push({ id, error: "Booking not found" });
          continue;
        }

        if (booking.status === "RETURNED") {
          errors.push({ id, error: "Booking already returned" });
          continue;
        }

        const updated = await prisma.booking.update({
          where: { id },
          data: {
            status: "RETURNED",
            endDate: now,
          },
        });

        await autoFixBikeStatus(booking.bikeId, orgId);
        results.push(updated);
      } catch (err) {
        errors.push({ id, error: "Failed to update" });
      }
    }

    return successResponse(
      res,
      {
        updated: results,
        errors,
        summary: {
          total: bookingIds.length,
          success: results.length,
          failed: errors.length,
        },
      },
      `${results.length} bookings marked as returned`
    );
  } catch (err) {
    console.error("Error in bulk mark returned:", err);
    return serverErrorResponse(res, err);
  }
};

/** DELETE BOOKING (SOFT DELETE) */
export const deleteBooking = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const id = req.params.id;

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
    });

    if (!booking) {
      return notFoundResponse(res, "Booking");
    }

    // Soft delete
    await prisma.booking.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    await autoFixBikeStatus(booking.bikeId, orgId);

    return successResponse(res, null, "Booking deleted successfully");
  } catch (err) {
    console.error("Error deleting booking:", err);
    return serverErrorResponse(res, err);
  }
};

/** GET BIKE AVAILABILITY (exposes computeAvailability) */
export const getBikeAvailability = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const bikeId = req.params.id;

    const bike = await prisma.bike.findUnique({ where: { id: bikeId } });
    if (!bike || bike.organizationId !== orgId || bike.isDeleted) {
      return notFoundResponse(res, "Bike");
    }

    const availability = await computeAvailability(bikeId, orgId);

    // best-effort align DB status
    await autoFixBikeStatus(bikeId, orgId);

    return successResponse(res, {
      ...availability,
      isAvailableNow: availability.isAvailableNow && bike.status !== "MAINTENANCE",
    });
  } catch (err) {
    console.error("getBikeAvailability error:", err);
    return serverErrorResponse(res, err);
  }
};

/** ADD PAYMENT TO BOOKING */
export const addPayment = async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { id } = req.params;
    const { amount, method, notes } = req.body;

    if (!amount || amount <= 0) {
      return errorResponse(res, "Valid amount is required", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: orgId, isDeleted: false },
    });

    if (!booking) {
      return notFoundResponse(res, "Booking");
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        bookingId: id,
        amount: Number(amount),
        method: method || "CASH",
        notes: notes?.trim() || null,
      },
    });

    // Update booking's paidAmount
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        paidAmount: { increment: Number(amount) },
      },
      include: {
        bike: true,
        payments: { orderBy: { date: "desc" } },
      },
    });

    return successResponse(
      res,
      {
        payment,
        booking: updatedBooking,
      },
      "Payment added successfully"
    );
  } catch (err) {
    console.error("Error adding payment:", err);
    return serverErrorResponse(res, err);
  }
};
