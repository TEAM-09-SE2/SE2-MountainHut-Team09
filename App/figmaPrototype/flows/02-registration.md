# 02 - Registration

## Frame

- Desktop: 1440x1024
- Mobile: 390x844

## Screen goal

Allow users to create an account and speed up future bookings.

## UI structure

1. Minimal header with logo and back-to-home link.
2. Form card with:
   - First name
   - Last name
   - Email
   - Phone (optional)
   - Password
   - Confirm password
   - Privacy consent checkbox
   - "Create account" button
3. Secondary link "Already have an account? Login".

## Core components

- Text/email/tel/password inputs
- Password strength meter
- Privacy checkbox
- Primary button

## Validation rules

- Required: first name, last name, email, password, confirm password, privacy consent
- Password/confirm password match
- Valid email format

## Main interactions

- Valid submit -> account created confirmation -> Login redirect
- Login link -> Login screen
