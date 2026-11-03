import { ConflictError, NotFoundError } from "../errors/ErrorClass.js";
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

export { createSlot, copySlot, getSlotById };