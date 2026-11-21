import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SlotCapacity from "../../../src/pages/SlotCapacity";
import { createSlot, getSlot, getSlotsByDate } from "../../../src/api";

// Keep the page tests independent from the backend and control each API response per test.
vi.mock("../../../src/api", () => ({
  createSlot: vi.fn(),
  getSlot: vi.fn(),
  getSlotsByDate: vi.fn(),
}));

// The navigation bar uses authentication state, which is outside this page's scope.
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

// A representative saved slot used to test read-only display and table copying.
const SAVED_SLOT = {
  id: 8,
  startAt: "2026-11-01T15:00:00",
  endAt: "2026-11-01T16:30:00",
  totalSeats: 10,
};

function renderSlotCapacity() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <SlotCapacity />
    </MemoryRouter>,
  );
  return user;
}

// Wait for the initial API request so later interactions start from a stable UI.
async function renderEmptySlotCapacity() {
  getSlotsByDate.mockResolvedValue([]);
  const user = renderSlotCapacity();
  await screen.findByText("No time slots for this day");
  return user;
}

async function addDraft(user) {
  await user.click(screen.getByRole("button", { name: /Add time slot/ }));
  await screen.findByRole("button", { name: /Set tables/ });
}

// Add one default table type and return its seats input for further editing.
async function addTableType(user) {
  await user.click(screen.getByRole("button", { name: /Add table type/ }));
  return screen.getByRole("spinbutton", { name: "Seats per table" });
}

beforeEach(() => {
  // Give every test predictable successful defaults; individual tests override these as needed.
  vi.clearAllMocks();
  getSlotsByDate.mockResolvedValue([]);
  getSlot.mockResolvedValue({ tables: [] });
});

afterEach(() => {
  // Restore spies such as window.confirm after each test.
  vi.restoreAllMocks();
});

describe("SlotCapacity", () => {
  // Initial data is loaded for the default date and an empty response shows both empty states.
  it("loads the selected day's slots and shows the empty state", async () => {
    renderSlotCapacity();

    expect(await screen.findByText("No time slots for this day")).toBeInTheDocument();
    expect(getSlotsByDate).toHaveBeenCalledWith("2026-11-01");
    expect(screen.getAllByText("No slot selected")).toHaveLength(2);
  });

  // A failed list request should expose Retry and recover when the next request succeeds.
  it("shows a retry action when loading saved slots fails", async () => {
    getSlotsByDate
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValue([]);
    const user = renderSlotCapacity();

    expect(await screen.findByText("Could not load the saved slots")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry/ }));

    await waitFor(() => {
      expect(screen.queryByText("Could not load the saved slots")).not.toBeInTheDocument();
      expect(screen.getByText("No time slots for this day")).toBeInTheDocument();
    });
  });

  // A new draft starts with the default one-hour interval but cannot be saved without tables.
  it("adds a draft slot with default times and requires tables before saving", async () => {
    const user = await renderEmptySlotCapacity();
    await addDraft(user);

    expect(screen.getByLabelText("Start time")).toHaveValue("12:00");
    expect(screen.getByLabelText("End time")).toHaveValue("13:00");
    expect(screen.getByText("Not saved · no tables yet")).toBeInTheDocument();
    expect(screen.getByText("Add at least one table type.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save slot" })).toBeDisabled();
  });

  // Validate both a non-positive duration and an intersection with an existing draft.
  it("reports invalid and overlapping time ranges", async () => {
    const user = await renderEmptySlotCapacity();
    await addDraft(user);
    await user.click(screen.getByRole("button", { name: /Add time slot/ }));

    fireEvent.change(screen.getAllByLabelText("End time")[1], {
      target: { value: "12:30" },
    });
    expect(screen.getAllByText("End time must be after start time.")).toHaveLength(2);

    fireEvent.change(screen.getAllByLabelText("Start time")[1], {
      target: { value: "12:30" },
    });
    fireEvent.change(screen.getAllByLabelText("End time")[1], {
      target: { value: "13:30" },
    });
    expect(screen.getAllByText("Overlaps with 12:00–13:00.")).toHaveLength(2);
  });

  // Slot options are sorted by start time even when a later-created draft starts earlier.
  it("updates slots' ordering when their start times change", async () => {
    const user = await renderEmptySlotCapacity();
    await addDraft(user);
    await user.click(screen.getByRole("button", { name: /Add time slot/ }));

    fireEvent.change(screen.getAllByLabelText("Start time")[1], {
      target: { value: "10:00" },
    });

    const slotOptions = within(screen.getAllByRole("combobox")[0])
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(slotOptions.indexOf("10:00–14:00 (not saved)")).toBeLessThan(
      slotOptions.indexOf("12:00–13:00 (not saved)"),
    );
  });

  // Table edits update the capacity summary; empty or non-positive values block saving.
  it("adds, edits, and removes table types while updating the capacity summary", async () => {
    const user = await renderEmptySlotCapacity();
    await addDraft(user);

    const seats = await addTableType(user);
    const counts = screen.getByRole("spinbutton", { name: "Number of tables" });
    expect(seats).toHaveValue(4);
    expect(counts).toHaveValue(1);
    expect(screen.getByText("4", { selector: "p.text-4xl" })).toBeInTheDocument();

    await user.clear(seats);
    expect(screen.getByText("Seats per table and number of tables must be 1 or more.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save slot" })).toBeDisabled();

    await user.type(seats, "6");
    await user.clear(counts);
    await user.type(counts, "2");
    expect(screen.getByText("12", { selector: "p.text-4xl" })).toBeInTheDocument();
    expect(screen.getByText("Not saved · 2 tables, 12 seats")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove table type" }));
    expect(screen.getByText("Add at least one table type.")).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "p.text-4xl" })).toBeInTheDocument();
  });

  // Removing the active draft also clears the selection and returns the page to its empty state.
  it("removes a draft slot and clears the selected slot", async () => {
    const user = await renderEmptySlotCapacity();
    await addDraft(user);

    await user.click(screen.getByRole("button", { name: "Remove time slot" }));

    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    expect(screen.getAllByText("No slot selected")).toHaveLength(2);
    expect(screen.getByText("No time slots for this day")).toBeInTheDocument();
  });

  // Changing dates must warn before discarding drafts, and cancellation must preserve them.
  it("protects unsaved drafts when changing the date", async () => {
    const user = await renderEmptySlotCapacity();
    await addDraft(user);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-11-02" },
    });
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("Start time")).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-11-02" },
    });
    await waitFor(() => expect(getSlotsByDate).toHaveBeenCalledWith("2026-11-02"));
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-02");
    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  // Configured drafts on the same day can be used as sources for another draft.
  it("copies table configuration from another draft", async () => {
    const user = await renderEmptySlotCapacity();
    await addDraft(user);
    await addTableType(user);
    await user.click(screen.getByRole("button", { name: /Add time slot/ }));

    // The second select is the copy-source selector; choose its draft option by its visible label.
    const copySelect = screen.getAllByRole("combobox")[1];
    const draftOption = within(copySelect)
      .getAllByRole("option")
      .find((option) => option.textContent.includes("(draft)"));
    await user.selectOptions(copySelect, draftOption.value);
    await user.click(screen.getByRole("button", { name: "Copy tables" }));

    expect(screen.getAllByRole("spinbutton", { name: "Seats per table" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save slot" })).toBeEnabled();
    expect(await screen.findByText("Copied 1 tables · 4 seats")).toBeInTheDocument();
  });

  // Saved API tables with matching seat counts should become a single editable table type.
  it("copies saved tables by grouping identical table sizes", async () => {
    getSlotsByDate.mockResolvedValue([SAVED_SLOT]);
    getSlot.mockResolvedValue({
      tables: [
        { tableNumber: 1, seats: 2 },
        { tableNumber: 2, seats: 4 },
        { tableNumber: 3, seats: 2 },
      ],
    });
    const user = renderSlotCapacity();
    await screen.findByText("Saved · 10 seats");
    await addDraft(user);

    const copySelect = screen.getAllByRole("combobox")[1];
    await user.selectOptions(copySelect, "saved-8");
    await user.click(screen.getByRole("button", { name: "Copy tables" }));

    expect(getSlot).toHaveBeenCalledWith(8);
    expect(await screen.findByText("Copied 3 tables · 8 seats")).toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton", { name: "Seats per table" })[0]).toHaveValue(2);
    expect(screen.getAllByRole("spinbutton", { name: "Number of tables" })[0]).toHaveValue(2);
    expect(screen.getAllByRole("spinbutton", { name: "Seats per table" })[1]).toHaveValue(4);
  });

  // Copying must report a useful message rather than silently losing a failed request.
  it("shows an error toast if copying a saved slot fails", async () => {
    getSlotsByDate.mockResolvedValue([SAVED_SLOT]);
    getSlot.mockRejectedValue(new Error("network error"));
    const user = renderSlotCapacity();
    await screen.findByText("Saved · 10 seats");
    await addDraft(user);

    await user.selectOptions(screen.getAllByRole("combobox")[1], "saved-8");
    await user.click(screen.getByRole("button", { name: "Copy tables" }));

    expect(await screen.findByText("Could not load the selected slot")).toBeInTheDocument();
  });

  // Existing slots display grouped table counts but remain read-only in this workflow.
  it("shows saved slots as read-only and groups their tables", async () => {
    getSlotsByDate.mockResolvedValue([SAVED_SLOT]);
    getSlot.mockResolvedValue({
      tables: [
        { tableNumber: 1, seats: 2 },
        { tableNumber: 2, seats: 2 },
        { tableNumber: 3, seats: 6 },
      ],
    });
    const user = renderSlotCapacity();
    await screen.findByText("Saved · 10 seats");
    await user.click(screen.getByRole("button", { name: /View tables/ }));

    expect(await screen.findByText("2 tables of 2 seats")).toBeInTheDocument();
    expect(screen.getByText("1 table of 6 seats")).toBeInTheDocument();
    expect(screen.getByText("This slot is already saved. Changing an existing slot is part of MH-19 (modify slot).")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save slot" })).not.toBeInTheDocument();
    expect(screen.getByText("10", { selector: "p.text-4xl" })).toBeInTheDocument();
  });

  // The page should surface a failed request for a selected saved slot's table details.
  it("shows an error if saved table details cannot be loaded", async () => {
    getSlotsByDate.mockResolvedValue([SAVED_SLOT]);
    getSlot.mockRejectedValue(new Error("network error"));
    const user = renderSlotCapacity();
    await screen.findByText("Saved · 10 seats");
    await user.click(screen.getByRole("button", { name: /View tables/ }));

    expect(await screen.findByText("Could not load the tables of this slot.")).toBeInTheDocument();
  });

  // Saving converts each table type into numbered API table records and refreshes the list.
  it("saves a valid draft by expanding table types and refreshes saved slots", async () => {
    const createdSlot = { id: 19, totalSeats: 10 };
    createSlot.mockResolvedValue(createdSlot);
    getSlotsByDate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...SAVED_SLOT, id: 19, totalSeats: 10 }])
      .mockResolvedValue([]);
    const user = renderSlotCapacity();
    await screen.findByText("No time slots for this day");
    await addDraft(user);
    const seats = await addTableType(user);
    await user.clear(seats);
    await user.type(seats, "2");
    const count = screen.getByRole("spinbutton", { name: "Number of tables" });
    await user.clear(count);
    await user.type(count, "3");
    await user.click(screen.getByRole("button", { name: "Save slot" }));

    // Match the page's local-date-to-ISO conversion without assuming a fixed timezone offset.
    const expectedStart = new Date("2026-11-01T12:00:00").toISOString();
    const expectedEnd = new Date("2026-11-01T13:00:00").toISOString();
    await waitFor(() => {
      expect(createSlot).toHaveBeenCalledWith({
        startAt: expectedStart,
        endAt: expectedEnd,
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 2 },
          { tableNumber: 3, seats: 2 },
        ],
      });
    });
    expect(await screen.findByText("Slot 12:00–13:00 saved · 10 seats")).toBeInTheDocument();
    expect(screen.getByText("Saved · 10 seats")).toBeInTheDocument();
  });

  // A rejected save keeps the draft editable and displays the server-provided error.
  it("shows the API error when saving a draft fails", async () => {
    createSlot.mockRejectedValue(new Error("Capacity conflict"));
    const user = await renderEmptySlotCapacity();
    await addDraft(user);
    await addTableType(user);
    await user.click(screen.getByRole("button", { name: "Save slot" }));

    expect(await screen.findByText("Capacity conflict")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save slot" })).toBeEnabled();
    expect(screen.getByLabelText("Start time")).toBeInTheDocument();
  });
});
