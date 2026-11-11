# 07 - MH-06 Change a booking

## User story

As a hiker, I want to change the date, time, party size, or requirements of my booking, so that the reservation reflects my current plans.

## Main frames

1. "My bookings" page: list of the hiker's bookings.
2. "Change booking" form, opened from a booking in the list.

## UI blocks

- Bookings list: date, time, party size, requirements (allergies highlighted), status
- "Change" button on each booking that can still be changed
- Change form, prefilled with the current booking:
  - Date picker and time slot selector
  - Party size stepper
  - Party requirements list (same controls as the booking wizard)
- Summary of the changes before confirming
- Result message: booking updated, and whether the email was sent

## Visual rules

- The "Change" button is shown only for confirmed bookings whose slot starts in at least 48 hours; otherwise show "Changes close 48 hours before the slot".
- Past and cancelled bookings are shown greyed out, without the "Change" button.
- Confirm CTA enabled only when something has changed and the requirements do not exceed the party size.
- If there are not enough seats, show that the change was refused and the booking is unchanged.
