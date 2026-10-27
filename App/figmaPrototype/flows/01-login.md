# 01 - Login

## Frame

- Desktop: 1440x1024
- Mobile: 390x844

## Screen goal

Enable fast and secure sign-in for hiker and employee roles.

## UI structure

1. Minimal header with logo and back-to-home link.
2. Centered auth card with:
   - Email
   - Password
   - "Remember me" checkbox
   - "Forgot password" link
   - "Login" button
3. Secondary link "Don''t have an account? Register".

## Core components

- Text input
- Password input with visibility toggle
- Checkbox
- Primary button
- Inline error message

## Validation rules

- Required email with valid format
- Required password
- Generic invalid credentials message

## Main interactions

- Valid submit -> authenticated home variant by role
- Register link -> Registration screen
