# 08 - MH-07 Reserve for a hiker

## User story

As an employee, I want to enter a reservation for a hiker, so that I can accept reservations via other channels than web.

## Main frame

Staff "New reservation for a hiker" page, in 3 steps:

1. Hiker
2. Reservation details (date, slot, party size, requirements)
3. Review and confirm

## UI blocks

- Hiker step, three options:
  - "Search existing hiker": search box (name, phone or email) with a result list; temporary hikers are marked "Temporary"
  - "New hiker account": email, first name, last name, optional phone, emergency contact and notes
  - "Quick entry": first name, last name, optional phone (temporary hiker, cannot log in)
- Date picker, slot selector (slots that have not started yet), party size stepper
- Party requirements list (same controls as the booking wizard)
- Booking summary panel
- Result screen: booking reference, tables, whether the confirmation email was sent

## Visual rules

- Quick entry is the default option, for parties arriving at the hut or phone calls.
- Slots that have already started cannot be selected.
- For a new hiker account, the result screen shows the temporary password once, in a highlighted box, with the hint "Give this password to the hiker. They will have to change it at the first login." The password cannot be shown again.
- For a temporary hiker, the result screen says that no confirmation email is sent.
- If the email of a new account is already used, suggest searching the existing hiker.
