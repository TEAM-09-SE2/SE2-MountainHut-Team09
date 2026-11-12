import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CheckAvailability from "../../../src/pages/CheckAvailability";
import { checkAvailability } from "../../../src/services/availabilityApi";
import { useAuth } from "../../../src/context/AuthContext";

vi.mock("../../../src/services/availabilityApi", () => ({
  checkAvailability: vi.fn(),
}));

vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const AVAILABLE_RESULT = {
  available: true,
  date: "2099-12-31",
  time: "18:30",
  partySize: 6,
  freeSeats: 6,
  slot: {
    id: 8,
    startAt: "2099-12-31T17:00:00.000Z",
    endAt: "2099-12-31T20:00:00.000Z",
  },
  allocation: [
    { tableNumber: 1, seats: 2 },
    { tableNumber: 2, seats: 3 },
    { tableNumber: 3, seats: 1 },
  ],
};

function renderPage(initialEntry = "/availability") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CheckAvailability />
    </MemoryRouter>,
  );
}

function setSearchFields({ date = "2099-12-31", time = "18:30", people = "6" } = {}) {
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: date },
  });
  fireEvent.change(screen.getByLabelText("Time"), {
    target: { value: time },
  });
  fireEvent.change(screen.getByLabelText("People"), {
    target: { value: people },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: null, logout: vi.fn() });
});

describe("CheckAvailability", () => {
  it("starts with the search form and does not call the API", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Find a table" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose a date, time and party size"),
    ).toBeInTheDocument();
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it("shows field errors and skips the API for an invalid search", async () => {
    const user = userEvent.setup();
    renderPage();
    setSearchFields({ date: "2000-01-01", time: "", people: "0" });

    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(
      screen.getByText("Please choose today or a later date."),
    ).toBeInTheDocument();
    expect(screen.getByText("Please choose a time.")).toBeInTheDocument();
    expect(
      screen.getByText("Enter a whole number, 1 or more."),
    ).toBeInTheDocument();
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it("submits valid values and renders the availability result", async () => {
    const user = userEvent.setup();
    checkAvailability.mockResolvedValue(AVAILABLE_RESULT);
    renderPage();
    setSearchFields();

    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(checkAvailability).toHaveBeenCalledWith("2099-12-31", "18:30", 6);
    expect(
      await screen.findByText("Split over 3 tables: 2 + 3 + 1 seats."),
    ).toBeInTheDocument();
    expect(screen.getByText("6 seats still free in this slot.")).toBeInTheDocument();
  });

  it("retries connection errors with the values currently in the form", async () => {
    const user = userEvent.setup();
    checkAvailability
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ...AVAILABLE_RESULT,
        partySize: 2,
      });
    renderPage();
    setSearchFields({ people: "2" });
    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(
      await screen.findByText(
        "There was a problem connecting to the hut booking system.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(checkAvailability).toHaveBeenNthCalledWith(
      2,
      "2099-12-31",
      "18:30",
      2,
    );
    expect(
      await screen.findByRole("heading", { name: "Result" }),
    ).toBeInTheDocument();
  });

  it("does not offer retry when the API rejects the search", async () => {
    const user = userEvent.setup();
    checkAvailability.mockRejectedValue(
      Object.assign(new Error("Bookings are closed."), { status: 422 }),
    );
    renderPage();
    setSearchFields();
    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(await screen.findByText("Bookings are closed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("restores and checks a search supplied in the URL", async () => {
    checkAvailability.mockResolvedValue({
      ...AVAILABLE_RESULT,
      partySize: 2,
    });

    renderPage("/availability?date=2099-12-31&time=18%3A30&partySize=2");

    expect(await screen.findByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(checkAvailability).toHaveBeenCalledWith("2099-12-31", "18:30", 2);
    expect(screen.getByLabelText("People")).toHaveValue(2);
  });
});
