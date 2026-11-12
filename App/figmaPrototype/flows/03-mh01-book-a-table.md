# 03 - MH-01 Book a table

## User story

As a hiker, I want to book an available table for date, time, and party size.

## Main frame

- "New booking" 5-step wizard:
  1. Date and time
  2. Party size
  3. Party requirements (optional, MH-05)
  4. Automatic table assignment
  5. Review and confirm

## UI blocks

- Date picker
- Time slot selector
- Party size stepper
- Party requirements list: "Add requirement" button; each row has a people stepper, an "Allergies" checkbox, a description field and a remove button
- Availability badge
- Sticky booking summary panel

## Visual rules

- If one table is not enough, show "Multi-table allocation".
- Confirm CTA enabled only when availability is valid.
- The total of people in the requirements cannot exceed the party size.
- Requirements with allergies are highlighted in the review step.
