import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StaffBookings from "../../../src/pages/StaffBookings";

// Keep site navigation outside the scope of the staff booking API workflow.
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

const API_BASE_URL = "http://localhost:4000/api/v1";
const OTHER_DATE = "2030-11-21";

const SLOT_A = {
  id: 17,
  startAt: "2030-11-20T12:00:00.000Z",
  endAt: "2030-11-20T13:00:00.000Z",
  totalSeats: 8,
  freeSeats: 5,
};
const SLOT_B = {
  id: 18,
  startAt: "2030-11-20T18:00:00.000Z",
  endAt: "2030-11-20T19:00:00.000Z",
  totalSeats: 8,
  freeSeats: 7,
};
const NEXT_DAY_SLOT = {
  ...SLOT_A,
  id: 27,
  startAt: `${OTHER_DATE}T12:00:00.000Z`,
  endAt: `${OTHER_DATE}T13:00:00.000Z`,
};

const ALL_BOOKINGS = [
  {
    id: 81,
    status: "confirmed",
    partySize: 2,
    hasAllergies: true,
    slot: SLOT_A,
    tables: [{ tableNumber: 4, seats: 2 }],
    requirements: [
      { id: 1, peopleCount: 1, hasAllergies: true, description: "Peanut allergy" },
      { id: 2, peopleCount: 1, hasAllergies: false, description: "Vegetarian" },
    ],
    hiker: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "555-0101",
      isTemporary: false,
      notes: "Keep the allergy meal separate.",
    },
  },
  {
    id: 82,
    status: "confirmed",
    partySize: 1,
    hasAllergies: false,
    slot: SLOT_A,
    tables: [],
    requirements: [
      { id: 3, peopleCount: 1, hasAllergies: false, description: "Vegan" },
    ],
    hiker: {
      firstName: "Grace",
      lastName: "Hopper",
      isTemporary: true,
    },
    createdBy: { firstName: "Warden", lastName: "One" },
  },
  {
    id: 83,
    status: "cancelled",
    partySize: 4,
    hasAllergies: true,
    slot: SLOT_B,
    tables: [{ tableNumber: 6, seats: 4 }],
    requirements: [
      { id: 4, peopleCount: 4, hasAllergies: true, description: "Shellfish allergy" },
    ],
    hiker: { firstName: "Katherine", lastName: "Johnson" },
  },
];

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderStaffBookings() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StaffBookings />
    </MemoryRouter>,
  );
  return user;
}

function staffReservationsRequests() {
  return fetch.mock.calls.filter(([url]) =>
    String(url).startsWith(`${API_BASE_URL}/reservations`),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url) => {
    if (String(url).startsWith(`${API_BASE_URL}/slots?date=`)) {
      const requestedDate = new URL(url).searchParams.get("date");
      return jsonResponse(
        requestedDate === OTHER_DATE ? [NEXT_DAY_SLOT] : [SLOT_A, SLOT_B],
      );
    }
    if (String(url).startsWith(`${API_BASE_URL}/reservations`)) {
      return jsonResponse(ALL_BOOKINGS);
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MH-05 staff booking integration", () => {
  it("loads bookings through the API and shows allergy flags and separate party requirements", async () => {
    // The full page-to-client-to-fetch path must preserve each requirement's
    // count, description, and allergy value for staff meal preparation.
    renderStaffBookings();

    const allergyBooking = await screen.findByTestId("staff-booking-81");
    expect(allergyBooking).toHaveTextContent("Ada Lovelace");
    expect(allergyBooking).toHaveTextContent("ada@example.com");
    expect(allergyBooking).toHaveTextContent("555-0101");
    expect(allergyBooking).toHaveTextContent("Table 4 · 2 seats");
    expect(allergyBooking).toHaveTextContent("1 × Peanut allergy (allergy)");
    expect(allergyBooking).toHaveTextContent("1 × Vegetarian");
    expect(allergyBooking).toHaveTextContent(
      "Allergies · special care needed",
    );
    expect(allergyBooking).toHaveTextContent(
      "Hiker notes: Keep the allergy meal separate.",
    );

    const ordinaryBooking = await screen.findByTestId("staff-booking-82");
    expect(ordinaryBooking).toHaveTextContent("1 person");
    expect(ordinaryBooking).toHaveTextContent("1 × Vegan");
    expect(ordinaryBooking).toHaveTextContent("Temporary");
    expect(ordinaryBooking).toHaveTextContent("Entered by Warden One");
    expect(ordinaryBooking).toHaveTextContent("None");
    expect(ordinaryBooking).not.toHaveTextContent(
      "Allergies · special care needed",
    );

    const cancelledBooking = await screen.findByTestId("staff-booking-83");
    expect(cancelledBooking).toHaveTextContent("Cancelled");
    expect(cancelledBooking).toHaveTextContent("4 × Shellfish allergy (allergy)");
    expect(cancelledBooking).not.toHaveTextContent(
      "Allergies · special care needed",
    );

    expect(screen.getByText("3 bookings")).toBeInTheDocument();
    expect(screen.getByText("3 people confirmed")).toBeInTheDocument();
    expect(screen.getByText("1 booking with allergies")).toBeInTheDocument();

    const day = screen.getByLabelText("Day").value;
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/slots?date=${day}`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/reservations?date=${day}`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("serializes the selected date, slot, and status filters and renders the filtered response", async () => {
    // Filter controls must drive real API requests with the chosen query values;
    // the UI should then render the matching server response rather than locally
    // filtering a stale unfiltered list.
    fetch.mockImplementation(async (url) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname.endsWith("/slots")) {
        return jsonResponse([SLOT_A, SLOT_B]);
      }
      if (requestUrl.pathname.endsWith("/reservations")) {
        if (
          requestUrl.searchParams.get("slotId") === "18" &&
          requestUrl.searchParams.get("status") === "confirmed"
        ) {
          return jsonResponse([]);
        }
        return jsonResponse(ALL_BOOKINGS);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = renderStaffBookings();
    await screen.findByTestId("staff-booking-81");
    const day = screen.getByLabelText("Day").value;

    await user.selectOptions(screen.getByLabelText("Status"), "confirmed");
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/reservations?date=${day}&status=confirmed`,
        expect.objectContaining({ method: "GET", credentials: "include" }),
      );
    });

    await user.selectOptions(screen.getByLabelText("Slot"), "18");

    expect(await screen.findByText(/No bookings for/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/reservations?date=${day}&slotId=18&status=confirmed`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(screen.queryByTestId("staff-booking-81")).not.toBeInTheDocument();
  });

  it("requests and displays cancelled bookings when the cancelled status filter is selected", async () => {
    // Both status choices in the MH-05 filter must be forwarded to the API;
    // cancelled records remain inspectable, including their saved requirements,
    // while the page continues to exclude them from confirmed summary totals.
    fetch.mockImplementation(async (url) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname.endsWith("/slots")) {
        return jsonResponse([SLOT_A, SLOT_B]);
      }
      if (requestUrl.pathname.endsWith("/reservations")) {
        return requestUrl.searchParams.get("status") === "cancelled"
          ? jsonResponse([ALL_BOOKINGS[2]])
          : jsonResponse(ALL_BOOKINGS);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = renderStaffBookings();
    await screen.findByTestId("staff-booking-81");
    const day = screen.getByLabelText("Day").value;

    await user.selectOptions(screen.getByLabelText("Status"), "cancelled");

    const cancelledBooking = await screen.findByTestId("staff-booking-83");
    expect(cancelledBooking).toHaveTextContent("Cancelled");
    expect(cancelledBooking).toHaveTextContent(
      "4 × Shellfish allergy (allergy)",
    );
    expect(screen.getByText("1 booking")).toBeInTheDocument();
    expect(screen.getByText("0 people confirmed")).toBeInTheDocument();
    expect(screen.getByText("No allergies")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/reservations?date=${day}&status=cancelled`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(screen.queryByTestId("staff-booking-81")).not.toBeInTheDocument();
  });

  it("changes the day, clears the date-specific slot, and fetches bookings for the new day", async () => {
    // A selected slot belongs to a single date. Changing the date should clear
    // it and request slots and reservations for the new day without the stale ID.
    const user = renderStaffBookings();
    await screen.findByTestId("staff-booking-81");
    await user.selectOptions(screen.getByLabelText("Slot"), "18");
    await waitFor(() => {
      const requests = staffReservationsRequests();
      expect(requests[requests.length - 1][0]).toContain("slotId=18");
    });

    await user.clear(screen.getByLabelText("Day"));
    await user.type(screen.getByLabelText("Day"), OTHER_DATE);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/slots?date=${OTHER_DATE}`,
        expect.objectContaining({ method: "GET", credentials: "include" }),
      );
      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/reservations?date=${OTHER_DATE}`,
        expect.objectContaining({ method: "GET", credentials: "include" }),
      );
    });
    expect(screen.getByLabelText("Slot")).toHaveValue("");
    expect(await screen.findByTestId("staff-booking-81")).toBeInTheDocument();
  });

  it("displays backend errors and retries the same filtered staff request", async () => {
    // An unsuccessful API response must be shown as an error rather than as an
    // empty day, and retry should repeat the request with the active filters.
    let reservationsAttempts = 0;
    fetch.mockImplementation(async (url) => {
      if (String(url).startsWith(`${API_BASE_URL}/slots?date=`)) {
        return jsonResponse([SLOT_A, SLOT_B]);
      }
      if (String(url).startsWith(`${API_BASE_URL}/reservations`)) {
        reservationsAttempts += 1;
        if (reservationsAttempts === 1) {
          return jsonResponse(
            { error: "FORBIDDEN", message: "Staff access is required." },
            403,
          );
        }
        return jsonResponse([ALL_BOOKINGS[0]]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = renderStaffBookings();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Staff access is required.",
    );
    const day = screen.getByLabelText("Day").value;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    const booking = await screen.findByTestId("staff-booking-81");
    expect(within(booking).getByText("1 × Peanut allergy (allergy)")).toBeInTheDocument();
    expect(reservationsAttempts).toBe(2);
    expect(staffReservationsRequests()).toHaveLength(2);
    expect(staffReservationsRequests()[1][0]).toBe(
      `${API_BASE_URL}/reservations?date=${day}`,
    );
  });
});
