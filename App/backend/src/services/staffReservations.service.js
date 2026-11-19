import { randomBytes } from "node:crypto";
import pool from "../database/connection.js";
import reservationRepository from "../database/reservation.repository.js";
import staffReservationsRepository from "../database/staffReservations.repository.js";
import slotRepository from "../database/slot.repository.js";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError, UnprocessableEntityError } from "../errors/ErrorClass.js";
import { hashPassword } from "../utils/cryptoUtils.js";
import tableAssignmentService from "./tableAssignment.service.js";
import confirmationEmailService from "./confirmationEmail.service.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normalize an optional string the same way as the registration endpoint.
function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new BadRequestError(`${fieldName} must be a string.`, "INVALID_INPUT");
  }
  return value.trim() || null;
}

// Validate and normalize a full or temporary hiker submitted by staff.
function validateNewHiker(input, isTemporary) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestError("Hiker details must be an object.", "INVALID_INPUT");
  }

  const allowedFields = isTemporary
    ? ["firstName", "lastName", "phone"]
    : [
      "email",
      "firstName",
      "lastName",
      "phone",
      "emergencyContactName",
      "emergencyContactPhone",
      "notes",
    ];
  for (const field of Object.keys(input)) {
    if (!allowedFields.includes(field)) {
      throw new BadRequestError(
        "Hiker details contain unsupported fields.",
        "INVALID_INPUT",
      );
    }
  }

  const firstName =
    typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName =
    typeof input.lastName === "string" ? input.lastName.trim() : "";
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    throw new BadRequestError(
      "firstName and lastName are required and must be at most 100 characters.",
      "INVALID_INPUT",
    );
  }

  const phone = normalizeOptionalString(input.phone, "Phone number");
  if (phone !== null && (phone.length > 10 || !/^\d+$/.test(phone))) {
    throw new BadRequestError(
      "Phone number must contain only digits and be at most 10 characters long.",
      "INVALID_INPUT",
    );
  }

  // Temporary-hiker case: keep login credentials and full-account details unset.
  if (isTemporary) {
    return {
      email: null,
      firstName,
      lastName,
      phone,
      emergencyContactName: null,
      emergencyContactPhone: null,
      notes: null,
      isTemporary: true,
    };
  }

  // Full-account case: validate email and the optional registration details.
  if (
    typeof input.email !== "string" ||
    input.email.trim().length > 255 ||
    !EMAIL_REGEX.test(input.email.trim())
  ) {
    throw new BadRequestError("Invalid email format.", "INVALID_INPUT");
  }

  const emergencyContactName = normalizeOptionalString(
    input.emergencyContactName,
    "Emergency contact name",
  );
  if (emergencyContactName?.length > 100) {
    throw new BadRequestError(
      "Emergency contact name must be at most 100 characters long.",
      "INVALID_INPUT",
    );
  }

  const emergencyContactPhone = normalizeOptionalString(
    input.emergencyContactPhone,
    "Emergency contact phone",
  );
  if (
    emergencyContactPhone !== null &&
    (emergencyContactPhone.length > 10 || !/^\d+$/.test(emergencyContactPhone))
  ) {
    throw new BadRequestError(
      "Emergency contact phone must contain only digits and be at most 10 characters long.",
      "INVALID_INPUT",
    );
  }
  if (Boolean(emergencyContactName) !== Boolean(emergencyContactPhone)) {
    throw new BadRequestError(
      "Emergency contact name and phone must be provided together.",
      "INVALID_INPUT",
    );
  }

  const notes = normalizeOptionalString(input.notes, "Notes");
  if (notes?.length > 1000) {
    throw new BadRequestError("Notes must be at most 1000 characters long.", "INVALID_INPUT");
  }

  return {
    email: input.email.trim().toLowerCase(),
    firstName,
    lastName,
    phone,
    emergencyContactName,
    emergencyContactPhone,
    notes,
    isTemporary: false,
  };
}

// Generate the one-time 12-character password for a newly created full hiker account.
function generateTemporaryPassword() {
  return randomBytes(9).toString("base64url");
}

// Create the hiker and staff reservation atomically, then send any confirmation email after commit.
async function createStaffReservation(
  staffId,
  { slotId, partySize, requirements, hikerId, newHiker, temporaryHiker },
) {
  const isCreatingHiker = newHiker !== undefined || temporaryHiker !== undefined;
  const normalizedHiker = isCreatingHiker
    ? validateNewHiker(temporaryHiker ?? newHiker, temporaryHiker !== undefined)
    : null;
  // Only a new full account gets a temporary password; existing and temporary hikers cannot log in.
  const temporaryPassword =
    normalizedHiker && !normalizedHiker.isTemporary
      ? generateTemporaryPassword()
      : undefined;
  const credentials = temporaryPassword
    ? hashPassword(temporaryPassword)
    : { hash: null, salt: null };

  const client = await pool.connect();
  let booking;
  try {
    await client.query("BEGIN");

    const createdBy = await staffReservationsRepository.findStaffMemberById(client, staffId);
    if (!createdBy) {
      throw new UnauthorizedError(
        "User is not authenticated.",
        "NOT_AUTHENTICATED",
      );
    }

    // Existing-hiker case: load the requested user and reject IDs that are not hikers.
    let hiker = hikerId === undefined
      ? null
      : await staffReservationsRepository.findHikerById(client, hikerId);
    if (hikerId !== undefined && !hiker) {
      throw new NotFoundError("The hiker does not exist.", "HIKER_NOT_FOUND");
    }

    // Staff bookings close only when the slot starts; the database clock is used for this check.
    const slot = await slotRepository.lockSlotById(client, slotId);
    if (!slot) {
      throw new NotFoundError("The slot does not exist.", "SLOT_NOT_FOUND");
    }
    if (slot.started) {
      throw new UnprocessableEntityError(
        "The slot has already started.",
        "SLOT_STARTED",
      );
    }

    if (
      hiker &&
      await reservationRepository.hasConfirmedReservation(client, hiker.id, slotId)
    ) {
      throw new ConflictError(
        "The hiker already has a confirmed reservation for this slot.",
        "ALREADY_BOOKED",
      );
    }

    const freeTables = await slotRepository.findFreeTablesBySlotId(client, slotId);
    const tables = tableAssignmentService.assignTables(freeTables, partySize);
    if (!tables) {
      throw new ConflictError(
        "Not enough free seats in this slot.",
        "NOT_ENOUGH_SEATS",
      );
    }

    // New-hiker cases: insert either a full account or a temporary hiker in this transaction.
    if (isCreatingHiker) {
      try {
        hiker = await staffReservationsRepository.insertHiker(
          client,
          normalizedHiker,
          credentials.hash,
          credentials.salt,
        );
      } catch (error) {
        if (error.code === "23505" && error.constraint === "app_user_email_key") {
          throw new ConflictError(
            "An account with this email already exists.",
            "EMAIL_ALREADY_USED",
          );
        }
        throw error;
      }
    }

    const reservationId =
      await staffReservationsRepository.insertStaffReservation(
        client,
        hiker.id,
        slotId,
        partySize,
        staffId,
      );
    await reservationRepository.insertReservationSeats(
      client,
      reservationId,
      slotId,
      tables,
    );
    if (requirements.length > 0) {
      await reservationRepository.insertReservationRequirements(
        client,
        reservationId,
        requirements,
      );
    }

    const timestamps = await reservationRepository.getReservationTimestamps(
      client,
      reservationId,
    );
    const savedRequirements =
      await reservationRepository.getReservationRequirements(client, reservationId);

    await client.query("COMMIT");
    const assignedTables = [];
    for (const table of tables) {
      assignedTables.push({
        tableNumber: table.tableNumber,
        seats: table.seats,
      });
    }
    booking = {
      id: reservationId,
      slotId,
      startAt: slot.start_at,
      partySize,
      status: "confirmed",
      tables: assignedTables,
      requirements: savedRequirements,
      createdAt: timestamps.created_at,
      updatedAt: timestamps.updated_at,
      hiker: {
        id: hiker.id,
        firstName: hiker.first_name,
        lastName: hiker.last_name,
        email: hiker.email,
        phone: hiker.phone,
        isTemporary: hiker.is_temporary,
      },
      createdBy,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const confirmationSent = booking.hiker.email
    ? await confirmationEmailService.sendBookingConfirmation(booking.id)
    : false;
  return {
    ...booking,
    confirmationSent,
    ...(temporaryPassword ? { temporaryPassword } : {})
  };
}

export default { createStaffReservation };
