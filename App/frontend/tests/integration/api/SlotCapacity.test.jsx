import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SlotCapacity from "../../../src/pages/SlotCapacity";

// Keep navigation/auth concerns out of these tests so they focus on page-to-API behavior.
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

const SAVED_SLOT = {
  id: 21,
  startAt: "2026-11-01T12:00:00.000Z",
  endAt: "2026-11-01T13:00:00.000Z",
  totalSeats: 8,
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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SlotCapacity API integration", () => {
  it("creates a slot through the API client and reloads the saved slot list", async () => {
    let slotHasBeenCreated = false;

    fetch.mockImplementation(async (_url, options = {}) => {
      if (options.method === "POST") {
        slotHasBeenCreated = true;
        return jsonResponse(SAVED_SLOT, 201);
      }

      return jsonResponse(slotHasBeenCreated ? [SAVED_SLOT] : []);
    });
    const user = renderSlotCapacity();

    expect(await screen.findByText("No time slots for this day")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/slots?date=2026-11-01",
      expect.objectContaining({ credentials: "include" }),
    );

    await user.click(screen.getByRole("button", { name: /Add time slot/ }));
    await user.click(screen.getByRole("button", { name: /Add table type/ }));
    await user.click(screen.getByRole("button", { name: "Save slot" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:4000/api/v1/slots",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            startAt: new Date("2026-11-01T12:00:00").toISOString(),
            endAt: new Date("2026-11-01T13:00:00").toISOString(),
            tables: [{ tableNumber: 1, seats: 4 }],
          }),
        }),
      );
    });

    expect(await screen.findByText("Saved · 8 seats")).toBeInTheDocument();
    expect(await screen.findByText("Slot 12:00–13:00 saved · 8 seats")).toBeInTheDocument();
  });

  it("requests saved slot details when staff opens its tables", async () => {
    fetch.mockImplementation(async (url) => {
      if (url.endsWith("/slots/21")) {
        return jsonResponse({
          ...SAVED_SLOT,
          tables: [
            { tableNumber: 1, seats: 4 },
            { tableNumber: 2, seats: 4 },
          ],
        });
      }

      return jsonResponse([SAVED_SLOT]);
    });
    const user = renderSlotCapacity();

    expect(await screen.findByText("Saved · 8 seats")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /View tables/ }));

    expect(await screen.findByText("2 tables of 4 seats")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/slots/21",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
