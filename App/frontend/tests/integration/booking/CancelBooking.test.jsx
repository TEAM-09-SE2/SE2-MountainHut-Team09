import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyBookings from "../../../src/pages/MyBookings";
import StaffBookings from "../../../src/pages/StaffBookings";

//MH-08: page -> reservationApi -> fetch. Only the network is faked, so the requests,
//the error codes and the answers go through the real API client.

vi.mock("../../../src/components/common/Navbar", () => ({ default: () => null }));
vi.mock("../../../src/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 4, role: "hiker", email: "anna@example.com" } }),
}));

const API = "http://localhost:4000/api/v1";

const SLOT = {
  id: 7,
  startAt: "2030-11-20T11:00:00.000Z",
  endAt: "2030-11-20T12:00:00.000Z",
};
const CANCELLED_AT = "2030-11-18T09:30:00.000Z";

const myBooking = (overrides) => ({
  id: 31,
  slot: SLOT,
  partySize: 4,
  status: "confirmed",
  changeable: true,
  cancellable: true,
  cancelledAt: null,
  requirements: [],
  ...overrides,
});

const staffBooking = (overrides) => ({
  id: 41,
  slot: SLOT,
  partySize: 2,
  status: "confirmed",
  tables: [{ tableNumber: 3, seats: 2 }],
  hasAllergies: false,
  requirements: [],
  cancelledAt: null,
  cancelledBy: null,
  hiker: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isTemporary: false },
  ...overrides,
});

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

//Answers each request with the handler of the first matching "METHOD path" prefix
function fakeApi(routes) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? "GET";
    const path = String(url).replace(API, "");
    const key = Object.keys(routes).find((route) => {
      const [routeMethod, routePath] = route.split(" ");
      return routeMethod === method && path.startsWith(routePath);
    });
    if (!key) throw new Error(`Unexpected request: ${method} ${path}`);
    return routes[key](path, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requests = (fetchMock, method, path) =>
  fetchMock.mock.calls.filter(
    ([url, options = {}]) =>
      (options.method ?? "GET") === method && String(url) === `${API}${path}`,
  );

function renderPage(page) {
  const user = userEvent.setup();
  render(<MemoryRouter>{page}</MemoryRouter>);
  return user;
}

async function confirmCancel(user, card) {
  await user.click(within(card).getByRole("button", { name: /^Cancel booking MH-/ }));
  const dialog = screen.getByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MH-08 cancel a booking – hiker (My bookings)", () => {
  it("cancels with POST /reservations/:id/cancel and greys out the booking in the list", async () => {
    const fetchMock = fakeApi({
      "GET /me/reservations": () => json([myBooking(), myBooking({ id: 32 })]),
      "POST /reservations/31/cancel": () =>
        json({
          id: 31,
          slotId: 7,
          startAt: SLOT.startAt,
          partySize: 4,
          status: "cancelled",
          cancelledAt: CANCELLED_AT,
          cancelledBy: { id: 4, firstName: "Anna", lastName: "Neri", role: "hiker" },
          confirmationSent: true,
        }),
    });
    const user = renderPage(<MyBookings />);

    const card = await screen.findByTestId("booking-31");
    await confirmCancel(user, card);

    const [cancelRequest] = requests(fetchMock, "POST", "/reservations/31/cancel");
    expect(cancelRequest[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(card).toHaveTextContent("Cancelled");
    expect(card).toHaveTextContent("A cancellation email has been sent to anna@example.com.");
    expect(within(card).queryByRole("button", { name: /^Cancel booking/ })).toBeNull();
    //Only the cancelled booking changes; the list is not loaded again
    expect(screen.getByTestId("booking-32")).toHaveTextContent("Confirmed");
    expect(requests(fetchMock, "GET", "/me/reservations")).toHaveLength(1);
  });

  it("shows the SLOT_ENDED refusal of the API and reloads the list", async () => {
    let listCalls = 0;
    const fetchMock = fakeApi({
      //After the refusal the API no longer lists the booking, whose slot has ended
      "GET /me/reservations": () => json(listCalls++ === 0 ? [myBooking()] : []),
      "POST /reservations/31/cancel": () =>
        json({ error: "SLOT_ENDED", message: "The slot has already ended." }, 422),
    });
    const user = renderPage(<MyBookings />);

    const dialog = await confirmCancel(user, await screen.findByTestId("booking-31"));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Booking MH-31 can no longer be cancelled: its slot has already ended.",
    );
    expect(await screen.findByText("No upcoming bookings")).toBeInTheDocument();
    expect(requests(fetchMock, "GET", "/me/reservations")).toHaveLength(2);
  });

  it("asks to log in again when the API answers 401", async () => {
    fakeApi({
      "GET /me/reservations": () => json([myBooking()]),
      "POST /reservations/31/cancel": () =>
        json({ error: "NOT_AUTHENTICATED", message: "Invalid or expired token" }, 401),
    });
    const user = renderPage(<MyBookings />);

    const dialog = await confirmCancel(user, await screen.findByTestId("booking-31"));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Your session has expired. Log in again to cancel the booking.",
    );
    expect(within(dialog).getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });
});

describe("MH-08 cancel a booking – staff (Bookings)", () => {
  it("shows the bookings without a Cancel button and never calls a cancel endpoint", async () => {
    const fetchMock = fakeApi({
      "GET /slots": () => json([SLOT]),
      "GET /reservations": () => json([staffBooking()]),
    });
    renderPage(<StaffBookings />);

    const card = await screen.findByTestId("staff-booking-41");
    expect(card).toHaveTextContent("Confirmed");
    expect(within(card).queryByRole("button", { name: /cancel/i })).toBeNull();
    const posts = fetchMock.mock.calls.filter(([, options = {}]) => options.method === "POST");
    expect(posts).toHaveLength(0);
  });
});
