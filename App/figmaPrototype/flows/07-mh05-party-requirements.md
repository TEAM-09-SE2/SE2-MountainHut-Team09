# 07 - MH-05 Party requirements

## User story

As a hiker, I want to specify dietary restrictions and allergies for people in my party.

## Main frame

- Dedicated step in the booking flow.

## UI structure

1. Party member list (Member 1 ... N).
2. For each member:
   - "Allergies" toggle
   - "Dietary restrictions" toggle
   - details text area
3. Safety banner when at least one allergy is flagged.

## Core components

- Member accordion
- Toggle switches
- Textarea with character count
- Safety info alert

## Visual rules

- Requirements can be assigned to subsets of the party.
- Details field is required when allergy toggle is enabled.
