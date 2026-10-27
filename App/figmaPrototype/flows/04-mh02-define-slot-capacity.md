# 04 - MH-02 Define slot capacity

## User story

As an employee, I want to define tables and seats for each time slot.

## Main frame

- Employee dashboard -> "Slot management"

## UI structure

1. Filters: date and time range.
2. Table list with capacity and state (enabled/disabled).
3. Slot editor:
   - available seats
   - booking limit
   - operational notes
4. Save / discard actions.

## Core components

- Table grid
- Numeric inputs
- Table state toggles
- Save confirmation toast

## States

- Unconfigured slot (empty state)
- Overloaded slot (warning)
