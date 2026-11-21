import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffReserve from "../../../src/pages/StaffReserve";

vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

const API_BASE_URL = "http://localhost:4000/api/v1";
const SLOT = {
  id: 7,
  startAt: "2099-12-15T11:00:00.000Z",
  endAt: "2099-12-15T13:00:00.000Z",
  freeSeats: 8,
  totalSeats: 10,
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function open() {
  window.history.replaceState({}, "", "/staff/reserve");
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

async function enterTemporaryHiker(user) {
  await user.type(screen.getByLabelText(/First name/), "Luca");
  await user.type(screen.getByLabelText(/Last name/), "Neri");
  await user.type(screen.getByLabelText(/Phone number/), "3331234567");
  await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
  await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /seats free/ }));
  await user.clear(screen.getByLabelText(/Party size/));
  await user.type(screen.getByLabelText(/Party size/), "2");
  await user.click(screen.getByRole("button", { name: /Review reservation/ }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith(`${API_BASE_URL}/slots?date=`)) {
      return jsonResponse([SLOT]);
    }
    if (requestUrl.startsWith(`${API_BASE_URL}/staff/hikers?`)) {
      return jsonResponse([
        {
          id: 12,
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          phone: "3337654321",
          isTemporary: false,
        },
      ]);
    }
    if (requestUrl === `${API_BASE_URL}/staff/reservations` && options.method === "POST") {
      const payload = JSON.parse(options.body);
      return jsonResponse({
        id: 41,
        partySize: payload.partySize,
        startAt: SLOT.startAt,
        hiker: payload.temporaryHiker
          ? { ...payload.temporaryHiker, isTemporary: true }
          : payload.newHiker
            ? { ...payload.newHiker, isTemporary: false }
            : { id: payload.hikerId, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isTemporary: false },
        tables: [{ tableNumber: 3, seats: payload.partySize }],
        confirmationSent: payload.temporaryHiker ? false : true,
      }, 201);
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MH-07 staff reservation integration", () => {
  it("completes a temporary-hiker reservation through slot and staff-reservation APIs", async () => {
    const user = open();

    await enterTemporaryHiker(user);
    expect(await screen.findByRole("heading", { name: "Review reservation details" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));

    expect(await screen.findByText(/Reservation created for Luca Neri/)).toBeInTheDocument();
    expect(screen.getByText(/No confirmation email was sent/)).toBeInTheDocument();
    expect(screen.getByText("MH-41")).toBeInTheDocument();

    const postRequest = fetch.mock.calls.find(([url, options]) =>
      String(url).endsWith("/staff/reservations") && options?.method === "POST",
    );
    expect(postRequest).toBeDefined();
    expect(JSON.parse(postRequest[1].body)).toEqual({
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

  it("searches an existing hiker, sends hikerId and normalizes selected requirements", async () => {
    const user = open();
    await user.click(screen.getByRole("tab", { name: /Search existing/ }));
    await user.type(screen.getByPlaceholderText("Type at least 2 characters..."), "Ada");

    const hiker = await screen.findByRole("button", { name: /Ada Lovelace/ });
    await user.click(hiker);
    await user.click(screen.getByRole("button", { name: /Continue to slot & party/ }));
    await waitFor(() => expect(screen.getByText(/8 of 10 seats free/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /seats free/ }));
    await user.click(screen.getByRole("button", { name: /Add requirement/ }));
    await user.clear(screen.getByLabelText("People for requirement 1"));
    await user.type(screen.getByLabelText("People for requirement 1"), "1");
    await user.type(screen.getByLabelText("Description for requirement 1"), "  Vegetarian  ");
    await user.click(screen.getByRole("button", { name: /Review reservation/ }));

    expect(await screen.findByText("Review reservation details")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));
    expect(await screen.findByText(/Reservation created for Ada Lovelace/)).toBeInTheDocument();

    const postRequest = fetch.mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(postRequest[1].body)).toEqual({
      slotId: 7,
      partySize: 2,
      hikerId: 12,
      requirements: [
        { peopleCount: 1, hasAllergies: false, description: "Vegetarian" },
      ],
    });
  });

  it("creates a full account and shows the API-returned temporary password once", async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).startsWith(`${API_BASE_URL}/slots?date=`)) {
        return jsonResponse([SLOT]);
      }
      if (String(url) === `${API_BASE_URL}/staff/reservations` && options.method === "POST") {
        return jsonResponse({
          id: 42,
          partySize: 2,
          startAt: SLOT.startAt,
          temporaryPassword: "Ab12Cd34Ef56",
          hiker: { firstName: "Anna", lastName: "Neri", email: "anna@example.com", isTemporary: false },
          tables: [{ tableNumber: 3, seats: 2 }],
          confirmationSent: true,
        }, 201);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = open();

    await user.click(screen.getByRole("tab", { name: /New full account/ }));
    await user.type(screen.getByLabelText(/Email/), "anna@example.com");
    await user.type(screen.getByLabelText(/First name/), "Anna");
    await user.type(screen.getByLabelText(/Last name/), "Neri");
    await user.type(screen.getByLabelText(/Emergency contact name/), "Marco Neri");
    await user.type(screen.getByLabelText(/Emergency contact phone/), "3337654321");
    await user.type(screen.getByLabelText(/Notes/), "Trail arrival");
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

    const postRequest = fetch.mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(postRequest[1].body).newHiker).toEqual({
      email: "anna@example.com",
      firstName: "Anna",
      lastName: "Neri",
      emergencyContactName: "Marco Neri",
      emergencyContactPhone: "3337654321",
      notes: "Trail arrival",
    });
  });

  it("renders slot conflict and duplicate-email API errors and allows recovery", async () => {
    const user = open();
    await enterTemporaryHiker(user);
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));

    expect(await screen.findByText(/No confirmation email was sent/)).toBeInTheDocument();

    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).startsWith(`${API_BASE_URL}/slots?date=`)) {
        return jsonResponse([SLOT]);
      }
      if (String(url) === `${API_BASE_URL}/staff/reservations` && options.method === "POST") {
        return jsonResponse(
          { error: "NOT_ENOUGH_SEATS", message: "No seats remain in this slot." },
          409,
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    await user.click(screen.getByRole("button", { name: "Enter another reservation" }));
    await enterTemporaryHiker(user);
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));

    expect(await screen.findByText("No seats remain in this slot.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review reservation/ })).toBeInTheDocument();

    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).startsWith(`${API_BASE_URL}/slots?date=`)) {
        return jsonResponse([SLOT]);
      }
      if (String(url) === `${API_BASE_URL}/staff/reservations` && options.method === "POST") {
        return jsonResponse(
          { error: "EMAIL_ALREADY_USED", message: "An account with this email already exists." },
          409,
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  it("shows backend confirmation-email failure as a reservation success", async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).startsWith(`${API_BASE_URL}/slots?date=`)) {
        return jsonResponse([SLOT]);
      }
      if (String(url) === `${API_BASE_URL}/staff/reservations` && options.method === "POST") {
        return jsonResponse({
          id: 43,
          partySize: 2,
          startAt: SLOT.startAt,
          hiker: { firstName: "Anna", lastName: "Neri", email: "anna@example.com", isTemporary: false },
          tables: [],
          confirmationSent: false,
        }, 201);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = open();
    await enterTemporaryHiker(user);
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));

    expect(await screen.findByText(
      "The reservation is confirmed, though the confirmation email could not be sent.",
    )).toBeInTheDocument();
  });
});
