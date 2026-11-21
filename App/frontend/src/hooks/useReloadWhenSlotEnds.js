import { useEffect, useState } from "react";

//setTimeout cannot wait more than ~24 days, so far slots are checked again every hour
const MAX_WAIT = 60 * 60 * 1000;
//The server still said "cancellable" for a slot that already ended for the browser
//(the two clocks differ): ask again a bit later instead of every second
const RETRY_WAIT = 30 * 1000;

//MH-08: `cancellable` comes from the server when the list is loaded, so it does not
//change while the page stays open. This reloads the list (with `reload`, which should not
//show a loading state) when the next cancellable slot ends, so its "Cancel" button goes away.
//The browser clock only decides when to ask: the server still decides what is cancellable.
export default function useReloadWhenSlotEnds(bookings, reload) {
  //Changes after each reload, so a failed reload that leaves `bookings` as it was is retried
  const [round, setRound] = useState(0);

  useEffect(() => {
    const ends = (bookings ?? [])
      .filter((booking) => booking.cancellable)
      .map((booking) => new Date(booking.slot.endAt).getTime());
    if (ends.length === 0) return undefined;

    const untilEnd = Math.min(...ends) - Date.now();
    //One second after the end, so the server already sees the slot as ended
    const wait =
      untilEnd >= 0 ? Math.min(untilEnd + 1000, MAX_WAIT) : RETRY_WAIT;
    const timer = setTimeout(async () => {
      try {
        await reload();
      } catch {
        //The page keeps its list, the next round asks again
      }
      setRound((current) => current + 1);
    }, wait);
    return () => clearTimeout(timer);
  }, [bookings, reload, round]);
}
