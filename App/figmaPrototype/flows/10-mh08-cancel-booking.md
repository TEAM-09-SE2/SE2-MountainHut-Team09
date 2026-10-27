# 10 - MH-08 Cancel booking

## User story

As a hiker, I want to cancel a table booking.

## Main frame

- Personal area -> Booking detail -> Cancel.

## UI structure

1. Booking summary card.
2. Danger CTA "Cancel booking".
3. Two-step confirmation modal:
   - confirm action intent
   - cancellation success
4. Post-action message about released availability.

## Core components

- Danger button
- Confirmation modal
- Success alert

## States

- Booking cancellable
- Booking already cancelled
- Cancellation error with retry
