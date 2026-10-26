# 11 - MH-09 Repeat weekly schedule

## User story

As an employee, I want to copy or repeat a schedule across multiple weeks.

## Main frame

- Employee dashboard -> Planning -> "Repeat week".

## UI structure

1. Source week selection.
2. Target week range selection.
3. Repeat options:
   - copy all slots
   - copy selected weekdays only
4. Impact preview (created/overwritten slots).
5. "Confirm repeat" CTA.

## Core components

- Week picker
- Weekday multi-select
- Summary panel
- Conflict modal

## States

- No conflicts
- Conflicts detected (explicit confirmation required)
- Repeat completed (toast + operation log)
