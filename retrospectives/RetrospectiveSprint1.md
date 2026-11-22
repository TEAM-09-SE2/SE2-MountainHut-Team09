# RETROSPECTIVE Sprint 1 (Team 09)

Sections:

- [process measures](#process-measures)
- [quality measures](#quality-measures)
- [general assessment](#assessment)

## PROCESS MEASURES

### Macro statistics

- Number of stories committed vs done : 4 vs 4
- Total points committed vs done : 36 vs 36
- Nr of hours planned vs spent (as a team) : 80h vs 82h 50m

**Remember** a story is done ONLY if it fits the Definition of Done:

- Unit Tests passing
- Code review completed
- Code present on VCS
- End-to-End tests performed

### Detailed statistics

| Story                     | # Tasks | Points | Hours est. | Hours actual |
| ------------------------- | ------- | ------ | ---------- | ------------ |
| _#0 Uncategorized Tasks_  | 12      | -      | 36h        | 36h 30m      |
| _#1 Book a table_         | 20      | 13     | 14h        | 15h          |
| _#2 Define slot capacity_ | 20      | 13     | 14h        | 13h 35m      |
| _#3 Receive confirmation_ | 13      | 5      | 9h         | 10h 05m      |
| _#4 Check availability_   | 12      | 5      | 7h         | 7h 40m       |
| _TOTAL_                   | 77      | 36     | 80h        | 82h 50m      |

- Hours per task <span style="color:red">per person</span> (average, standard deviation)

  | Member          | # Tasks | Total spent | Avg per task | Std dev |
  | --------------- | ------- | ----------- | ------------ | ------- |
  | Beatrice Marana | 17      | 17h 05m     | 1.01h        | 0.61h   |
  | Davide Maugeri  | 19      | 16h 10m     | 0.85h        | 0.50h   |
  | Elvin Sadikhov  | 25      | 17h         | 0.68h        | 0.45h   |
  | Roki            | 24      | 16h         | 0.67h        | 0.43h   |
  | Stefano Arca    | 17      | 16h 35m     | 0.98h        | 0.56h   |

  Overall (all members):
  - Estimated: average 0.79h, standard deviation 0.49h
  - Actual: average 0.81h, standard deviation 0.52h

- Total task estimation error ratio (sum of hours estimated / sum of hours spent − 1): 80 / 82.83 − 1 = **−0.034 (−3.4%)**

## QUALITY MEASURES

- Unit Testing:
  - Total hours estimated: 5h
  - Total hours spent: 5h
  - Nr of automated unit test cases: 109 (72 backend + 37 frontend)
  - Coverage (unit tests):
    - Backend: 75.9% lines, 88.2% branches, 67.6% functions
    - Frontend: 63.1% lines, 61.5% branches, 62.7% functions
- Integration testing:
  - Total hours estimated: 5h
  - Total hours spent: 5h
- E2E testing:
  - Total hours estimated: 5h
  - Total hours spent: 4h 15m
- Code review:
  - Total hours estimated: 8h
  - Total hours spent: 8h 55m

## ASSESSMENT

- What caused your errors in estimation (if any)?

  Overall our estimate was quite accurate (80h planned vs 82h 50m spent, −3.4%), but some tasks unexpectedly took longer than planned. Most of the overruns were on backend work, in particular the API implementation tasks (hiker login and sign up, book a table, receive confirmation, check availability), which required more time than estimated.

- What lessons did you learn (both positive and negative) in this sprint?
  - Positive: planning dedicated testing and review tasks for every story helped us keep the quality of the code under control, and splitting the work into small tasks made progress easier to track on the board.
  - Negative: we cannot leave everything to the last minute, since late work from some members blocks the rest of the team. Communication did not always work as expected.

- Which improvement goals set in the previous retrospective were you able to achieve?

  We kept the YouTrack board more up to date and we consistently communicated our progress on the code right after completing it.

- Which ones you were not able to achieve? Why?

  We aimed to work more consistently and distribute the effort evenly across the sprint, but this did not fully happen: some members spread their work over the two weeks, while others waited until the last moment, inevitably blocking the rest of the group. Moreover, although internal deadlines were set, they were not respected, and the situation only improved when the team had to escalate the issue.

- Improvement goals for the next sprint and how to achieve them (technical tasks, team coordination, etc.)
  1. Make better use of Git: work on feature branches, open pull requests for every change and use them for code review and communication.
  2. Divide the work better: assign each task to fewer people (2–3 instead of 5) so that coordination is simpler and responsibilities are clearer.
  3. Respect the internal deadlines we set, checking progress against them at each scrum meeting.

- One thing you are proud of as a Team!!

  In the end, we managed to complete all the work we committed to for this sprint, even though the way we got there was not the right one.
