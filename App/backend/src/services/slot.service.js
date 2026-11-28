import { ConflictError, NotFoundError, UnprocessableEntityError } from "../errors/ErrorClass.js";
import slotRepository from "../database/slot.repository.js";

//Create a new slot
async function createSlot(input, createdBy) {
    const result = await slotRepository.createSlot({startAt: input.startAt, endAt: input.endAt, tables: input.tables, createdBy});
    if (result.overlap) {
        throw new ConflictError("The slot overlaps with an existing slot.", "SLOT_OVERLAP");
    }

    return result.slot;
}

//Create a new slot by copying an existing one
async function copySlot(input, createdBy) {
    const result = await slotRepository.copySlot({startAt: input.startAt, endAt: input.endAt, copyTablesFromSlotId: input.copyTablesFromSlotId, createdBy});
    if (result.overlap) {
        throw new ConflictError("The slot overlaps with an existing slot.", "SLOT_OVERLAP");
    }

    if (result.sourceNotFound) {
        throw new NotFoundError("The slot to copy from does not exist.", "SLOT_NOT_FOUND");
    }

    return result.slot;
}

async function getSlotById(slotId) {
    const slot = await slotRepository.getSlotById(slotId);

    if (!slot) {
        throw new NotFoundError("The slot does not exist.", "SLOT_NOT_FOUND");
    }

    return slot;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

//copy the slots of a week into one or more following weeks.
//Dates are validated Mondays (YYYY-MM-DD); weeks and copyMenus already have their defaults.
async function copyWeek({ sourceWeekStart, targetWeekStart, weeks, copyMenus }, createdBy) {
    //Both dates are calendar days, so the difference in UTC is an exact number of days (multiple of 7)
    const dayOffset = Math.round((Date.parse(targetWeekStart) - Date.parse(sourceWeekStart)) / MS_PER_DAY);

    //The target weeks [target, target + weeks*7) must not include the source week
    if (dayOffset <= 0 && dayOffset > -7 * weeks) {
        throw new UnprocessableEntityError("The target weeks must not include the source week.", "TARGET_WEEK_NOT_VALID");
    }

    const result = await slotRepository.copyWeek({ sourceWeekStart, targetWeekStart, weeks, copyMenus, dayOffset, createdBy });

    if (result.targetWeekNotValid) {
        throw new UnprocessableEntityError("The target weeks must start after today.", "TARGET_WEEK_NOT_VALID");
    }
    if (result.sourceEmpty) {
        throw new NotFoundError("The source week has no slots.", "NO_SLOTS_IN_SOURCE_WEEK");
    }
    if (result.targetHasReservations) {
        throw new ConflictError("A slot of a target week has reservations.", "TARGET_WEEK_HAS_RESERVATIONS");
    }
    if (result.overlap) {
        throw new ConflictError("A copied slot overlaps with an existing slot.", "SLOT_OVERLAP");
    }

    return { createdSlots: result.createdSlots, replacedSlots: result.replacedSlots };
}

export { createSlot, copySlot, getSlotById, copyWeek };