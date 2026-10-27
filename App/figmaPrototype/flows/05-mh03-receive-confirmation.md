# 05 - MH-03 Receive confirmation

## User story

As a hiker, I want to receive a confirmation with booking details.

## Main frame

- Post-confirmation screen + email preview state.

## UI structure

1. Success banner ("Booking confirmed").
2. Details card:
   - booking code
   - date and time
   - party size
   - dietary requirements
3. "Email sent to [address]" section.
4. CTAs: "Back to Home" and "Edit booking".

## Core components

- Success alert
- Booking summary card
- Status chip (email status)

## States

- Email pending
- Email sent
- Email failed with "Retry send" action
