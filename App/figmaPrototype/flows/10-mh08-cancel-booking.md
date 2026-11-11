# 10 - MH-08 Cancel a booking

## User story

As a hiker, I want to cancel a table booking, so that the hut can make the places available to other guests.

## Main frames

1. Hiker "My bookings" page (see 07-mh06-change-booking.md), with a "Cancel" button.
2. Staff bookings page, with a "Cancel" button on each booking.
3. Confirmation dialog.

## UI blocks

- "Cancel" button (secondary, red) next to "Change"
- Confirmation dialog: "Cancel booking MH-<id>? The seats will be released." with "Keep booking" and "Cancel booking" buttons
- Result message: booking cancelled, and whether the email was sent
- Staff list: cancelled bookings show "Cancelled on <date> by <name>"

## Visual rules

- The "Cancel" button is shown only for confirmed bookings whose slot has not started yet.
- Cancelled bookings stay in the list, greyed out, with a "Cancelled" badge.
- The dialog's default focus is on "Keep booking", to avoid accidental cancellations.
