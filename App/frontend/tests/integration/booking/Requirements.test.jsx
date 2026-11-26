import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import BookTableWizard from "../../../src/components/booking/BookTableWizard";
import ChangeBooking from "../../../src/pages/ChangeBooking";
import MyBookings from "../../../src/pages/MyBookings";

// Keep site navigation outside the scope of the booking-requirements workflow.
vi.mock("../../../src/components/common/Navbar", () => ({
  default: () => null,
}));

const API_BASE_URL = "http://localhost:4000/api/v1";
const BOOKING_DATE = "2030-11-20";
const SLOT = {
  id: 7,
  startAt: `${BOOKING_DATE}T12:00:00.000Z`,
  endAt: `${BOOKING_DATE}T13:00:00.000Z`,
  totalSeats: 8,
  freeSeats: 8,
  bookable: true,
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderBookingWizard(partySize = 3) {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/book-table",
          state: { date: BOOKING_DATE, slotId: SLOT.id, partySize },
        },
      ]}
    >
      <Routes>
        <Route path="/book-table" element={<BookTableWizard />} />
      </Routes>
    </MemoryRouter>,
  );
  return user;
}

function renderChangeBooking() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/my-bookings/42/change"]}>
      <Routes>
        <Route path="/my-bookings/:id/change" element={<ChangeBooking />} />
      </Routes>
    </MemoryRouter>,
  );
  return user;
}

async function openRequirementsEditor(user) {
  // The slot and party size are prefilled to isolate this integration flow on MH-05.
  await screen.findByRole("heading", { name: "Assignment Verification" });
  await user.click(
    screen.getByRole("button", { name: /Continue to requirements/ }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MH-05 party requirements integration", () => {
  it("submits multiple subsets through the real API client and confirms returned allergy details", async () => {
    // This verifies the complete hiker journey: editing separate subsets,
    // reviewing the allergy warning, serializing the POST request, and displaying
    // the requirements returned by the reservation API after confirmation.
    const savedRequirements = [
      {
        id: 11,
        peopleCount: 1,
        hasAllergies: true,
        description: "Peanut allergy",
      },
      {
        id: 12,
        peopleCount: 2,
        hasAllergies: false,
        description: "Vegetarian",
      },
    ];
    fetch.mockImplementation(async (url, options = {}) => {
      if (url === `${API_BASE_URL}/slots?date=${BOOKING_DATE}`) {
        return jsonResponse([SLOT]);
      }
      if (url === `${API_BASE_URL}/reservations` && options.method === "POST") {
        return jsonResponse(
          {
            id: 52,
            slotId: SLOT.id,
            startAt: SLOT.startAt,
            partySize: 3,
            status: "confirmed",
            confirmationSent: true,
            requirements: savedRequirements,
          },
          201,
        );
      }
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${url}`);
    });

    const user = renderBookingWizard();
    await openRequirementsEditor(user);
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description for requirement 1" }),
      "  Peanut allergy  ",
    );
    await user.click(screen.getByRole("checkbox", { name: "Allergy" }));
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description for requirement 2" }),
      "Vegetarian",
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "People for requirement 2" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "People for requirement 2" }),
      "2",
    );

    await user.click(
      screen.getByRole("button", { name: "Proceed to summary" }),
    );
    expect(
      screen.getByText(/1 requirement reports an allergy/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 × Peanut allergy (allergy)"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 × Vegetarian")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Confirm Reservation" }),
    );

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/reservations`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: SLOT.id,
          partySize: 3,
          requirements: [
            {
              peopleCount: 1,
              hasAllergies: true,
              description: "Peanut allergy",
            },
            { peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
          ],
        }),
      }),
    );
    expect(await screen.findByText("Booking Confirmed!")).toBeInTheDocument();
    expect(
      screen.getByText("1 × Peanut allergy (allergy)"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 × Vegetarian")).toBeInTheDocument();
  });

  it("does not advance or send a booking when requirement coverage exceeds the party size", async () => {
    // Individually complete rows can still be invalid together. The integration
    // boundary must remain closed so no malformed MH-05 data reaches the API.
    fetch.mockImplementation(async (url) => {
      if (url === `${API_BASE_URL}/slots?date=${BOOKING_DATE}`) {
        return jsonResponse([SLOT]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = renderBookingWizard(2);
    await openRequirementsEditor(user);
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description for requirement 1" }),
      "Peanuts",
    );
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description for requirement 2" }),
      "Vegetarian",
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "People for requirement 2" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "People for requirement 2" }),
      "2",
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The requirements cover 3 people, but the party has only 2.",
    );
    expect(
      screen.getByRole("button", { name: "Proceed to summary" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("heading", { name: "Summary & Confirmation" }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      `${API_BASE_URL}/reservations`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("loads existing requirement subsets and PATCHes only the updated MH-05 field", async () => {
    // The existing booking and slot are loaded through the real API client.
    // Adding an allergy subset must preserve the already-saved diet entry and
    // send no unrelated slot or party-size fields in the partial update.
    const existingBooking = {
      id: 42,
      status: "confirmed",
      partySize: 3,
      changeable: true,
      slot: SLOT,
      requirements: [
        {
          id: 21,
          peopleCount: 2,
          hasAllergies: false,
          description: "Vegetarian",
        },
      ],
    };
    const updatedRequirements = [
      {
        id: 21,
        peopleCount: 2,
        hasAllergies: false,
        description: "Vegetarian",
      },
      {
        id: 22,
        peopleCount: 1,
        hasAllergies: true,
        description: "Shellfish allergy",
      },
    ];
    fetch.mockImplementation(async (url, options = {}) => {
      if (url === `${API_BASE_URL}/me/reservations`) {
        return jsonResponse([existingBooking]);
      }
      if (url === `${API_BASE_URL}/slots?date=${BOOKING_DATE}`) {
        return jsonResponse([SLOT]);
      }
      if (
        url === `${API_BASE_URL}/reservations/42` &&
        options.method === "PATCH"
      ) {
        return jsonResponse({
          ...existingBooking,
          requirements: updatedRequirements,
          confirmationSent: true,
        });
      }
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${url}`);
    });

    const user = renderChangeBooking();
    expect(await screen.findByDisplayValue("Vegetarian")).toBeInTheDocument();
    expect(
      screen.getByText("2 of 3 people associated · maximum 3"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description for requirement 2" }),
      "Shellfish allergy",
    );
    await user.click(screen.getAllByRole("checkbox", { name: "Allergy" })[1]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/reservations/42`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirements: [
            { peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
            {
              peopleCount: 1,
              hasAllergies: true,
              description: "Shellfish allergy",
            },
          ],
        }),
      }),
    );
    expect(await screen.findByText("Change confirmed")).toBeInTheDocument();
    expect(screen.getByText("2 × Vegetarian")).toBeInTheDocument();
    expect(
      screen.getByText("1 × Shellfish allergy (allergy)"),
    ).toBeInTheDocument();
  });

  it("renders stored allergy flags and subset descriptions in the hiker's booking list", async () => {
    // A requirement that has been persisted by the API must remain visible when
    // the hiker later returns to My Bookings, including its high-salience allergy
    // marker and the separate coverage count.
    fetch.mockResolvedValue(
      jsonResponse([
        {
          id: 70,
          status: "confirmed",
          partySize: 3,
          changeable: true,
          slot: {
            id: SLOT.id,
            startAt: SLOT.startAt,
            endAt: SLOT.endAt,
          },
          requirements: [
            {
              id: 31,
              peopleCount: 1,
              hasAllergies: true,
              description: "Peanuts",
            },
            {
              id: 2,
              peopleCount: 2,
              hasAllergies: false,
              description: "Vegetarian",
            },
          ],
        },
      ]),
    );
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MyBookings />} />
        </Routes>
      </MemoryRouter>,
    );

    const booking = await screen.findByTestId("booking-70");
    expect(booking).toHaveTextContent("1 × Peanuts (allergy)");
    expect(booking).toHaveTextContent("2 × Vegetarian");
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/me/reservations`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });
});
