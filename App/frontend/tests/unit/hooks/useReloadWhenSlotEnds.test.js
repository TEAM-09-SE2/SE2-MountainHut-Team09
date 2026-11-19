import { renderHook } from "@testing-library/react";
import useReloadWhenSlotEnds from "../../../src/hooks/useReloadWhenSlotEnds";

const NOW = new Date("2030-11-20T11:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

//A booking whose slot ends `msFromNow` after NOW
const booking = (id, msFromNow, cancellable = true) => ({
  id,
  cancellable,
  slot: { endAt: new Date(NOW.getTime() + msFromNow).toISOString() },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useReloadWhenSlotEnds (MH-08)", () => {
  it("sets no timer when nothing can be cancelled", () => {
    const reload = vi.fn();

    renderHook(() =>
      useReloadWhenSlotEnds([booking(1, 10 * MINUTE, false)], reload),
    );

    expect(vi.getTimerCount()).toBe(0);
  });

  it("sets no timer while the list is not loaded yet", () => {
    renderHook(() => useReloadWhenSlotEnds(null, vi.fn()));

    expect(vi.getTimerCount()).toBe(0);
  });

  it("reloads one second after the first cancellable slot ends", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const bookings = [
      booking(1, 40 * MINUTE),
      booking(2, 10 * MINUTE),
      //Ends earlier, but it can't be cancelled: it is ignored
      booking(3, 5 * MINUTE, false),
    ];

    renderHook(() => useReloadWhenSlotEnds(bookings, reload));

    await vi.advanceTimersByTimeAsync(10 * MINUTE + 999);
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("checks again every hour when the next slot is far away", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const bookings = [booking(1, 3 * 24 * HOUR)];

    renderHook(() => useReloadWhenSlotEnds(bookings, reload));

    await vi.advanceTimersByTimeAsync(HOUR - 1);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("asks again every 30 seconds while the server still says an ended slot is cancellable", async () => {
    //The browser clock is ahead of the server: the slot has ended only for the browser
    const reload = vi.fn().mockResolvedValue(undefined);
    const bookings = [booking(1, -5 * MINUTE)];

    renderHook(() => useReloadWhenSlotEnds(bookings, reload));

    await vi.advanceTimersByTimeAsync(30 * 1000 - 1);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("tries again after a failed reload", async () => {
    const reload = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const bookings = [booking(1, -MINUTE)];

    renderHook(() => useReloadWhenSlotEnds(bookings, reload));

    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("stops once the reloaded list has nothing left to cancel", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    let bookings = [booking(1, MINUTE)];
    const { rerender } = renderHook(() =>
      useReloadWhenSlotEnds(bookings, reload),
    );

    await vi.advanceTimersByTimeAsync(MINUTE + 1000);
    expect(reload).toHaveBeenCalledTimes(1);

    //The page got the new list from the server: the booking is no longer cancellable
    bookings = [booking(1, MINUTE, false)];
    rerender();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the page is closed", () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() =>
      useReloadWhenSlotEnds([booking(1, 10 * MINUTE)], reload),
    );
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
