# 09 - MH-07 Password recovery

## Screen goal

Let any user with an email (hiker, employee, warden) set a new password when they forgot it.

## Main frames

1. "Forgot password" screen, opened from the login page.
2. "Reset password" screen, opened from the link in the email.

## UI structure

- Forgot password: email field and "Send reset link" button.
- Reset password: new password and confirm new password, "Save password" button.

## Validation rules

- Valid email format.
- New password at least 8 characters, and the two fields must match.
- Reset link is single-use and valid for 24 hours. Requesting another link does not immediately invalidate the earlier one; completing a reset consumes the user's valid links.

## Main interactions

- Send reset link -> always the same message: "If an account exists for this email, we sent you a link to reset your password." (does not reveal which emails are registered)
- Email link -> Reset password screen
- Save password -> success message -> Login screen
- Invalid or expired link -> message "This link is not valid anymore" with a link to ask for a new one

## Current implementation

The pages are `/forgot-password` and `/reset-password?token=...`. Valid recovery requests return the same `202` response for existing and unknown accounts, assuming token persistence succeeds; SMTP failure is logged and does not change that response. A successful request does not guarantee delivery.

Both pages are currently inside `PasswordChangeGate`. A logged-in user whose temporary-password flag has loaded is sent to `/change-password` instead. Because the ordinary change endpoint is currently broken, that user must sign out before using recovery. See the [implementation status](../../../documentation/implementation-status.md) for the branch limitations.
