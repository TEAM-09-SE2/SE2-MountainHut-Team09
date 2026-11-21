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
   - Emergency contact name (optional)
   - Emergency contact phone (optional)
   - Notes (optional, multi-line text area, e.g. allergies or health information for the hut staff)
   - Password
   - Confirm password
   - Privacy consent checkbox
   - "Create account" button
3. Secondary link "Already have an account? Login".

## Core components

- Text/email/tel/password inputs
- Text area for notes, with a character counter (max 1000)
- Password strength meter
- Privacy checkbox
- Primary button

## Validation rules

- Required: first name, last name, email, password, confirm password, privacy consent
- Password/confirm password match
- Valid email format
- Optional: phone, emergency contact name, emergency contact phone, notes
- Emergency contact name and phone must be filled in together (both or neither)
- Emergency contact name max 100 characters; emergency contact phone uses the same format as phone (max 10 characters); notes max 1000 characters
- Hint under the notes field: the notes are visible to the hut staff

## Main interactions

- Valid submit -> account created confirmation -> Login redirect
- Login link -> Login screen
