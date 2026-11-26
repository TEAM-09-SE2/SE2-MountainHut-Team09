// Basic email format check: local part, "@", domain with at least one dot.
// The domain label before the first dot cannot contain a dot, so there is only one
// way to split the domain and the regex runs in linear time (no backtracking).
export const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
