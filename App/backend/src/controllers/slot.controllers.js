import { BadRequestError, UnauthorizedError } from "../errors/ErrorClass.js";
import { createSlot, copySlot, getSlotById } from "../services/slot.service.js";

//Check if the date is valid
function isValidDateTime(value) {
    const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/;
    if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value)) {
        return false;
    }

    return !isNaN(Date.parse(value));
}

//Validate the input for createSlotController
function validateCreateSlotInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new BadRequestError("The request body must be an object.", "INVALID_INPUT");
    }

    if (!isValidDateTime(input.startAt) || !isValidDateTime(input.endAt)) {
        throw new BadRequestError("startAt and endAt must be valid ISO 8601 date-times.", "INVALID_INPUT");
    }

    if (Date.parse(input.endAt) <= Date.parse(input.startAt)) {
        throw new BadRequestError("endAt must be after startAt.", "INVALID_INPUT");
    }

    const hasTables = Object.hasOwn(input, "tables");
    const hasCopySource = Object.hasOwn(input, "copyTablesFromSlotId");
    if (hasTables === hasCopySource) {
        throw new BadRequestError("Provide exactly one field between tables and copyTablesFromSlotId.", "INVALID_INPUT");
    }

    //Case: tables field is present
    if (hasTables) {
        if (!Array.isArray(input.tables) || input.tables.length === 0) {
            throw new BadRequestError("tables field must be a non-empty array.", "INVALID_INPUT");
        }

        const tableNumbers = new Set();
        for (const table of input.tables) {
            if (!table || typeof table !== "object" || !Number.isInteger(table.tableNumber) || table.tableNumber < 1 || !Number.isInteger(table.seats) || table.seats < 1) {
                throw new BadRequestError("Each table must have a positive tableNumber and seats fields.", "INVALID_INPUT");
            }

            if (tableNumbers.has(table.tableNumber)) {
                throw new BadRequestError(
                    "tableNumber values must be unique.",
                    "INVALID_INPUT",
                );
            }
            tableNumbers.add(table.tableNumber);
        }
    }
    //Case: copyTablesFromSlotId field is present
    else if (!Number.isInteger(input.copyTablesFromSlotId) || input.copyTablesFromSlotId < 1) {
        throw new BadRequestError("copyTablesFromSlotId must be a positive integer.", "INVALID_INPUT");
    }
}

async function createSlotController(request, response, next) {
    try {

        //TODO: remove when authentication and staff authorization middleware are added
        const createdBy = 1

        validateCreateSlotInput(request.body);

        let slot;
        //Case: copyTablesFromSlotId field is present
        if (Object.hasOwn(request.body, "copyTablesFromSlotId")) {
            slot = await copySlot(request.body, createdBy);
        }
        //Case: tables field is present
        else {
            slot = await createSlot(request.body, createdBy);
        }

        return response.status(201).json(slot);
    } catch (error) {
        return next(error);
    }
}

async function getSlotByIdController(request, response, next) {
    try {
        if (typeof request.params.id !== "string") {
            throw new BadRequestError("id must be present.", "INVALID_INPUT");
        }
        const slotId = Number(request.params.id.trim());
        if (!Number.isSafeInteger(slotId) || slotId < 1) {
            throw new BadRequestError("id must be a positive integer.", "INVALID_INPUT");
        }

        const slot = await getSlotById(slotId);
        return response.status(200).json(slot);
    } catch (error) {
        return next(error);
    }
}

export { createSlotController, getSlotByIdController };