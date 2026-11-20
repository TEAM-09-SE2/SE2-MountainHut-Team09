import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffReserve from "../../../src/pages/StaffReserve";
import {
  fetchSlotsByDate,
  searchHikers,
  createStaffReservation,
} from "../../../src/services/reservationApi";

vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));
vi.mock("../../../src/services/reservationApi", () => ({
  fetchSlotsByDate: vi.fn(),
  searchHikers: vi.fn(),
  createStaffReservation: vi.fn(),
}));

const FUTURE_SLOT = {
  id: 7,
  startAt: "2099-12-15T11:00:00.000Z",
  endAt: "2099-12-15T13:00:00.000Z",
  freeSeats: 8,
  totalSeats: 10,
};

function open() {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/staff/reserve" element={<StaffReserve />} />
        <Route path="/" element={<p>Staff home</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

function openAtPage() {
  window.history.pushState({}, "", "/staff/reserve");
  render(
    <MemoryRouter initialEntries={["/staff/reserve"]}>
      <Routes>
        <Route path="/staff/reserve" element={<StaffReserve />} />
        <Route path="/" element={<p>Staff home</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function continueWithTemporaryHiker(user) {
  await user.type(screen.getByLabelText(/First name/), "Luca");
  await user.type(screen.getByLabelText(/Last name/), "Neri");
  await user.type(screen.getByLabelText(/Phone number/), "3331234567");
  await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
  expect(await screen.findByText(/Time slot/)).toBeInTheDocument();
  await waitFor(() => expect(fetchSlotsByDate).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSlotsByDate.mockResolvedValue([FUTURE_SLOT]);
  searchHikers.mockResolvedValue([]);
  createStaffReservation.mockResolvedValue({
    id: 41,
    partySize: 2,
    startAt: FUTURE_SLOT.startAt,
    hiker: { firstName: "Luca", lastName: "Neri", isTemporary: true },
    confirmationSent: false,
  });
});
afterEach(() => cleanup());

describe("StaffReserve", () => {
  it("starts in quick-entry mode and validates required temporary hiker fields", async () => {
    const user = openAtPage();

    expect(screen.getByRole("tab", { name: /Quick entry/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "First name is required",
    );
  });

  it("rejects invalid temporary phone while continuing", async () => {
    const user = openAtPage();
    await user.type(screen.getByLabelText(/First name/), "Luca");
    await user.type(screen.getByLabelText(/Last name/), "Neri");
    await user.type(screen.getByLabelText(/Phone number/), "12-34");
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Phone number can only contain digits",
    );
  });

  it("debounces an existing-hiker search and allows selecting a result", async () => {
    searchHikers.mockResolvedValue([
      { id: 12, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isTemporary: false },
    ]);
    const user = openAtPage();

    await user.click(screen.getByRole("tab", { name: /Search existing/ }));
    await user.type(screen.getByPlaceholderText("Type at least 2 characters..."), "Ada");

    expect(await screen.findByRole("button", { name: /Ada Lovelace/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ada Lovelace/ }));
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));

    expect(await screen.findByText(/Time slot/)).toBeInTheDocument();
  });

  it("shows no-match and search-error states", async () => {
    const user = openAtPage();
    await user.click(screen.getByRole("tab", { name: /Search existing/ }));
    await user.type(screen.getByPlaceholderText("Type at least 2 characters..."), "Ada");

    expect(await screen.findByText(/No matching hikers found/)).toBeInTheDocument();

    searchHikers.mockRejectedValueOnce(new Error("Search unavailable"));
    await user.clear(screen.getByPlaceholderText("Type at least 2 characters..."));
    await user.type(screen.getByPlaceholderText("Type at least 2 characters..."), "Grace");
    expect(await screen.findByText("Search unavailable")).toBeInTheDocument();
  });

  it("requires selecting an existing hiker before continuing", async () => {
    const user = openAtPage();
    await user.click(screen.getByRole("tab", { name: /Search existing/ }));
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please search and select an existing hiker",
    );
  });

  it("validates full-account fields and emergency contact pairs", async () => {
    const user = openAtPage();
    await user.click(screen.getByRole("tab", { name: /New full account/ }));
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter a valid email address",
    );

    await user.type(screen.getByLabelText(/Email/), "anna@example.com");
    await user.type(screen.getByLabelText(/First name/), "Anna");
    await user.type(screen.getByLabelText(/Last name/), "Neri");
    await user.type(screen.getByLabelText(/Emergency contact name/), "Marco");
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Emergency contact name and phone must both be provided",
    );
  });

  it("loads slots, validates party size and seats, then creates a temporary hiker reservation", async () => {
    const user = openAtPage();
    await continueWithTemporaryHiker(user);

    await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /seats free/ }));
    await user.clear(screen.getByLabelText(/Party size/));
    await user.type(screen.getByLabelText(/Party size/), "9");
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Only 8 free seats");

    await user.clear(screen.getByLabelText(/Party size/));
    await user.type(screen.getByLabelText(/Party size/), "2");
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));
    expect(await screen.findByRole("heading", { name: "Review reservation details" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));

    expect(await screen.findByText(/Reservation created for Luca Neri/)).toBeInTheDocument();
    expect(screen.getByText(/No confirmation email was sent/)).toBeInTheDocument();
    expect(createStaffReservation).toHaveBeenCalledWith({
      slotId: 7,
      partySize: 2,
      requirements: [],
      temporaryHiker: {
        firstName: "Luca",
        lastName: "Neri",
        phone: "3331234567",
      },
    });
  });

  it("shows the temporary password once and supports copying and reset", async () => {
    createStaffReservation.mockResolvedValue({
      id: 42,
      partySize: 2,
      startAt: FUTURE_SLOT.startAt,
      temporaryPassword: "Ab12Cd34Ef56",
      hiker: { firstName: "Anna", lastName: "Neri", email: "anna@example.com", isTemporary: false },
      confirmationSent: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
    const user = openAtPage();
    await user.click(screen.getByRole("tab", { name: /New full account/ }));
    await user.type(screen.getByLabelText(/Email/), "anna@example.com");
    await user.type(screen.getByLabelText(/First name/), "Anna");
    await user.type(screen.getByLabelText(/Last name/), "Neri");
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
    await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /seats free/ }));
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));
    await user.click(await screen.findByRole("button", { name: "Confirm reservation" }));

    expect(await screen.findByText("Temporary password — shown once")).toBeInTheDocument();
    expect(screen.getByText("Ab12Cd34Ef56")).toBeInTheDocument();
    expect(screen.getByText(/A confirmation email was sent to/)).toHaveTextContent(
      "anna@example.com",
    );

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enter another reservation" }));
    expect(screen.getByRole("tab", { name: /Quick entry/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("handles confirmation-email failure and returns to staff home", async () => {
    createStaffReservation.mockResolvedValue({
      id: 43,
      partySize: 2,
      startAt: FUTURE_SLOT.startAt,
      hiker: { firstName: "Anna", lastName: "Neri", email: "anna@example.com", isTemporary: false },
      confirmationSent: false,
    });
    const user = openAtPage();
    await continueWithTemporaryHiker(user);
    await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /seats free/ }));
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));
    await user.click(await screen.findByRole("button", { name: "Confirm reservation" }));

    expect(await screen.findByText(/confirmation email could not be sent/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to staff home" }));
    expect(await screen.findByText("Staff home")).toBeInTheDocument();
  });

  it("refreshes slot choices on slot conflicts and shows duplicate-email recovery", async () => {
    const user = openAtPage();
    await continueWithTemporaryHiker(user);
    await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /seats free/ }));
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));

    createStaffReservation.mockRejectedValueOnce(
      Object.assign(new Error("The selected slot is no longer available."), {
        code: "NOT_ENOUGH_SEATS",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm reservation" }));
    expect(await screen.findByText(/selected slot is no longer available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review reservation/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("tab", { name: /New full account/ }));
    await user.type(screen.getByLabelText(/Email/), "used@example.com");
    await user.type(screen.getByLabelText(/First name/), "Anna");
    await user.type(screen.getByLabelText(/Last name/), "Neri");
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
    await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /seats free/ }));
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));

    createStaffReservation.mockRejectedValueOnce(
      Object.assign(new Error("Email already used"), { code: "EMAIL_ALREADY_USED" }),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm reservation" }));
    expect(await screen.findByText(/An account with this email already exists/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search for existing hiker" }));
    expect(screen.getByRole("tab", { name: /Search existing/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows requirements in review and sends the normalized requirements payload", async () => {
    const user = openAtPage();
    await continueWithTemporaryHiker(user);
    await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /seats free/ }));
    await user.click(screen.getByRole("button", { name: /Add requirement/ }));
    await user.type(screen.getByLabelText("Description for requirement 1"), "  Vegan  ");
    await user.click(screen.getByLabelText("Allergy or intolerance"));
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));

    expect(await screen.findByText("ALLERGY:")).toBeInTheDocument();
    expect(screen.getByText(/Vegan/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));

    expect(createStaffReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        requirements: [
          { peopleCount: 1, hasAllergies: true, description: "Vegan" },
        ],
      }),
    );
  });
});
