import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyBookings from "../../../src/pages/MyBookings";
import { fetchMyReservations } from "../../../src/services/reservationApi";

vi.mock("../../../src/services/reservationApi", () => ({
  fetchMyReservations: vi.fn(),
}));
vi.mock("../../../src/components/common/Navbar", () => ({ default: () => null }));

const booking = (overrides) => ({
  id: 31,
  slot: {
    id: 7,
    startAt: "2026-11-20T18:00:00.000Z",
    endAt: "2026-11-20T19:15:00.000Z",
  },
  partySize: 4,
  status: "confirmed",
  changeable: true,
  cancellable: true,
  requirements: [
    { id: 1, peopleCount: 1, hasAllergies: true, description: "Peanuts" },
    { id: 2, peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
  ],
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyBookings />
    </MemoryRouter>,
  );

describe("MyBookings", () => {
  it("shows the Change button only for changeable bookings and explains the others", async () => {
    fetchMyReservations.mockResolvedValue([
      booking(),
      booking({ id: 32, changeable: false }),
    ]);

    renderPage();

    const open = await screen.findByTestId("booking-31");
    expect(open).toHaveTextContent("MH-31");
    expect(open.querySelector('a[href="/my-bookings/31/change"]')).toBeInTheDocument();

    const closed = screen.getByTestId("booking-32");
    expect(closed.querySelector("a")).toBeNull();
    expect(closed).toHaveTextContent("Changes close 48 hours before the slot");
  });

  it("marks allergies with text and lists them before the diets", async () => {
    fetchMyReservations.mockResolvedValue([
      booking({
        requirements: [
          { id: 2, peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
          { id: 1, peopleCount: 1, hasAllergies: true, description: "Peanuts" },
        ],
      }),
    ]);

    renderPage();

    const card = await screen.findByTestId("booking-31");
    const texts = [...card.querySelectorAll("ul li")].map((li) => li.textContent);
    expect(texts.findIndex((t) => t.includes("1 × Peanuts (allergy)"))).toBeLessThan(
      texts.findIndex((t) => t.includes("2 × Vegetarian")),
    );
  });

  it("greys out cancelled bookings and offers no action", async () => {
    fetchMyReservations.mockResolvedValue([
      booking({ status: "cancelled", changeable: false, cancellable: false }),
    ]);

    renderPage();

    const card = await screen.findByTestId("booking-31");
    expect(card).toHaveTextContent("Cancelled");
    expect(card.querySelector("a")).toBeNull();
  });

  it("shows an empty state and an error with retry", async () => {
    fetchMyReservations.mockResolvedValueOnce([]);
    const { unmount } = renderPage();
    expect(await screen.findByText("No upcoming bookings")).toBeInTheDocument();
    unmount();

    fetchMyReservations.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });
});
