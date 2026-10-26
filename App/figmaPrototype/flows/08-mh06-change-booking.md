# 08 - MH-06 Change booking

## User story

As a hiker, I want to change date, time, party size, or requirements of my booking.

## Main frame

- Personal area -> Booking detail -> Edit.

## UI structure

1. Header with booking code and status.
2. "Editable until ..." block (48h rule).
3. Editable form:
   - date and time
   - party size
   - requirements
4. Live availability check on every change.
5. "Save changes" CTA.

## Core components

- Date/time picker
- Party size stepper
- Inline availability checker
- Change confirmation modal

## States

- Edit allowed
- Edit blocked (outside 48h window)
- Availability conflict
