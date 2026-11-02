import { NotFoundError } from "../errors/ErrorClass.js";
import slotRepository from "../database/slot.repository.js";

//Create a new slot
async function createSlot(input, createdBy) {
    return slotRepository.createSlot({startAt: input.startAt, endAt: input.endAt, tables: input.tables, createdBy});
}

//Create a new slot by copying an existing one
async function copySlot(input, createdBy) {
    const slot = await slotRepository.copySlot({startAt: input.startAt, endAt: input.endAt, copyTablesFromSlotId: input.copyTablesFromSlotId, createdBy});

    if (!slot) {
        throw new NotFoundError("The slot to copy from does not exist.", "SLOT_NOT_FOUND");
    }

    return slot;
}

async function getSlotById(slotId) {
    const slot = await slotRepository.getSlotById(slotId);

    if (!slot) {
        throw new NotFoundError("The slot does not exist.", "SLOT_NOT_FOUND");
    }

    return slot;
}

export { createSlot, copySlot, getSlotById };