# RETROSPECTIVE Sprint 2 (Team 09)

The retrospective should include _at least_ the following
sections:

- [process measures](#process-measures)
- [quality measures](#quality-measures)
- [general assessment](#assessment)

## PROCESS MEASURES 

### Macro statistics

- Number of stories committed vs done : 4 vs 4
- Total points committed vs done : 19 vs 19
- Nr of hours planned vs spent (as a team) : 80h vs 79h 55m

**Remember**  a story is done ONLY if it fits the Definition of Done:
 
- Unit Tests passing
- Code review completed
- Code present on VCS
- End-to-End tests performed


### Detailed statistics

| Story                             | # Tasks | Points | Hours est. | Hours actual |
| -------------------------         | ------- | ------ | ---------- | ------------ |
| _#0 Uncategorized Tasks_          | 21      | -      | 37h 30m    | 37h 35m      |
| _#5 Provide party requirements_   | 12      | 3      | 10h        | 10h          |
| _#6 Change a booking_             | 12      | 8      | 9h 30m     | 9h 20m       |
| _#7 Reserve for a hinker_         | 12      | 3      | 13h 30m    | 13h 35m      |
| _#8 Cancel a booking_             | 12      | 5      | 9h 30m     | 9h 25m       |
| _TOTAL_                           | 69      | 19     | 80h        | 79h 55m      |
   

- Hours per task  <span style="color:red">per person</span>  (average, standard deviation)

| Member          | # Tasks | Total spent | Avg per task (estimated) | Avg per task (spent) | Std dev (estimated) | Std dev (spent) |
| --------------- | ------- | ----------- | ------------------------ | -------------------- | ------------------- | --------------- |
| Beatrice Marana |   19    | 15h 55m     |        0h 50m            |         0h 50m       |        0h 30m       |      0h 30m     |                  
| Davide Maugeri  |   18    | 16h 25m     |        0h 54m            |         0h 54m       |        0h 34m       |      0h 34m     |                 
| Elvin Sadikhov  |   15    | 16h         |        1h 00m            |         1h 00m       |        0h 37m       |      0h 37m     |                 
| Roki            |   19    | 16h         |        0h 50m            |         0h 50m       |        0h 24m       |      0h 24m     |                 
| Stefano Arca    |   17    | 15h 35m     |        0h 55m            |         0h 55m       |        0h 33m       |      0h 33m     |

Overall (all members, 89 tasks):
- Estimated: average 0.90h, standard deviation 0.51h
- Actual: average 0.90h, standard deviation 0.52h

- Total task estimation error ratio: sum of total hours estimation / sum of total hours spent -1:  80 / 79.92 − 1 = **+0.001 (+0.1%)**

  
## QUALITY MEASURES 

- Unit Testing:
  - Total hours estimated: 9h
  - Total hours spent: 9h
  - Nr of automated unit test cases: 539 (235 frontend and 304 backend)
  - Coverage (unit tests):
    - Backend: 85.5% lines, 94.8% branches, 80.7% functions
    - Frontend: 90.1% lines, 83.2% branches, 87.3% functions
- Integration testing:
  - Total hours estimated: 5h
  - Total hours spent: 4h 45m
- E2E testing:
  - Total hours estimated: 2h 30m
  - Total hours spent: 2h 30m
- Code review: 
  - Total hours estimated: 4h 30m
  - Total hours spent: 4h 20m


## ASSESSMENT

- What caused your errors in estimation (if any)?
- 
 Our estimate was very accurate this sprint (80h planned vs 79h 55m spent, +0.1%), and it improved compared to the previous sprint (−3.4%). The few overruns were again on backend work: the API implementation tasks took 5 to 20 minutes more than planned, and checking the architecture and DB document took 1h instead of 30m. These were balanced by tests, reviews and documentation updates that took less time than estimated.

- What lessons did you learn (both positive and negative) in this sprint?

- Positive: we divided the work in a smarter way, assigning each task to at most 2–3 people instead of all 5. Coordination was simpler, responsibilities were clearer and the workflow was much smoother. 
- Negative: we learned that we should not schedule the scrum meetings on the same day they take place, because it makes it hard for everyone to attend and to prepare.

- Which improvement goals set in the previous retrospective were you able to achieve? 

We achieved all of them:
  1. We made better use of Git, working on feature branches and opening pull requests for our changes, which we also used for code review and communication.
  2. We divided the work better, assigning each task to 2–3 people instead of 5, which made coordination simpler and responsibilities clearer.
  3. We respected the internal deadlines we had set, so nobody was blocked waiting for someone else's work.
  
- Which ones you were not able to achieve? Why?

None: we reached all the goals we had set. The only aspect that did not work well was the organization of the scrum meetings, which were often scheduled on the same day they took place.

- Improvement goals for the next sprint and how to achieve them (technical tasks, team coordination, etc.)

  1. Organize the scrum meetings better: at the sprint planning we will fix the dates and times of all the scrum meetings of the sprint, so that they are never decided on the same day. Everyone will know in advance when to attend and can prepare a short update on what they did, what they will do next and any blockers.
  2. Keep the good practices of this sprint: pull requests for every change, 2–3 people per task and respect of the internal deadlines.

- One thing you are proud of as a Team!!

Our burndown chart! This sprint it followed the ideal line closely: we worked steadily across the whole sprint instead of leaving everything to the last days, and we completed all the work we committed to, with our total estimate (80h) almost exactly matching the time we actually spent (79h 55m).