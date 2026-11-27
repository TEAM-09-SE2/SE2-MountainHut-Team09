import { BadRequestError, ConflictError, NotFoundError, UnprocessableEntityError } from "../errors/ErrorClass.js";
import slotRepository from "../database/slot.repository.js";

const MAX_MENU_LENGTH = 5000;

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

async function updateSlotMenu(slotId, menu) {
    if (menu !== null && typeof menu !== "string") {
        throw new BadRequestError("menu must be a string or null.", "INVALID_INPUT");
    }

    const trimmedMenu = menu?.trim() || null;
    if (trimmedMenu !== null && Array.from(trimmedMenu).length > MAX_MENU_LENGTH) {
        throw new BadRequestError("menu must contain at most 5000 characters after trimming.", "INVALID_INPUT");
    }
    if (trimmedMenu !== null && (trimmedMenu.includes("\u0000") || !trimmedMenu.isWellFormed())) {
        throw new BadRequestError("menu must contain valid Unicode text without null characters.", "INVALID_INPUT");
    }

    const result = await slotRepository.updateSlotMenu(slotId, trimmedMenu);
    if (!result) {
        throw new NotFoundError("The slot does not exist.", "SLOT_NOT_FOUND");
    }
    if (result.started) {
        throw new UnprocessableEntityError("The slot has already started.", "SLOT_STARTED");
    }
    return result;
}

async function listMenus() {
    return slotRepository.listMenus();
}

export { createSlot, copySlot, getSlotById, updateSlotMenu, listMenus };
