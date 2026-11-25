# Technical Debt Strategy | Team 09

## Starting point

First analysis ran on **22 November 2026** (about 28k lines of code, JavaScript/TypeScript) gave these results:

| Metric                     | Value                      | Rating |
| -------------------------- | -------------------------- | ------ |
| Quality gate               | **Failed** (2 conditions)  |        |
| Security issues            | 31 (94% medium, 6% low)    | C      |
| Reliability issues         | 42 (24% high, 76% medium)  | D      |
| Maintainability issues     | 8                          | A      |
| Security hotspots reviewed | 100%                       | A      |
| Duplications               | 2.6%                       |        |
| Coverage                   | not reported to SonarCloud |        |
| Issues closed so far       | 0                          |        |

Total: **73 open issues**. The weakest areas are Reliability (D) and Security (C), while maintainability is already good.

## Principles

- **Clean as you code.** New or changed code must not add new SonarCloud issues. This stops the debt from growing while we pay back the old one.
- **Fix the riskiest debt first.** Issues that can cause wrong behaviour or a security problem come before style issues.
- **TD work is planned work.** Time for TD is estimated and planned in the sprint, like any other task, so it is not done "if there is time left".
- **Fixes go through the normal workflow.** A TD fix is a branch, a pull request and a review, like any other change.
- **Tests must stay green.** A refactoring that fixes an issue must not break the existing unit, integration and end-to-end tests.

## 1. Code quality checks in the sprint

### Our workflow per user story

Our sprints last two weeks and the team has five members. For each user story:

1. One member implements the **backend** on a feature branch (`feat/...`) and opens a pull request to `dev`.
2. Another member **reviews** the PR and leaves comments on it.
3. Backend unit, integration and end-to-end tests are written.
4. One member implements the **frontend**, another member reviews the PR.
5. Frontend unit and integration tests are written.
6. If the review is positive, the reviewer **merges** the PR into `dev`.
7. One member checks that the whole story works and updates the documentation.

### Where the SonarCloud check goes

From Sprint 3 on, each user story has **two extra estimated tasks**:

| Task                          | Estimate | Who                                        | When                                                    |
| ----------------------------- | -------- | ------------------------------------------ | ------------------------------------------------------- |
| SonarCloud TD check, backend  | 30 min   | the developer who writes the backend code  | after opening the backend PR, before asking for review  |
| SonarCloud TD check, frontend | 30 min   | the developer who writes the frontend code | after opening the frontend PR, before asking for review |

During this check the developer:

1. Opens the PR analysis on SonarCloud.
2. Looks at the issues **introduced by the PR**:
   - **High** reliability issues and any security issue must be fixed before merge;
   - **Medium/Low** issues should be fixed before merge; if the fix is not reasonable now, the developer lists it in a PR comment and it goes in the TD backlog (see below);
   - new **security hotspots** must be reviewed (marked _Safe_ or _Fixed_) on SonarCloud.
3. Checks duplications in the new code (we want to stay under 3%).
4. Fixes the issues on the same branch and writes a short comment on the PR: `SonarCloud: OK` or the list of issues still open.

The reviewer then checks that the comment is there and that the PR respects the merge rule below. The reviewer merges only after this.

### Definition of Done

We add this item to our Definition of Done:

> The SonarCloud analysis of the story's pull requests shows **no new High or Security issues**, and every remaining new issue is either fixed or recorded in the TD backlog.

### Sprint level checks

- At the **start of each sprint**, during planning, we look at the SonarCloud dashboard and choose which existing issues to pay back in the sprint (see section 2).
- At the **end of each sprint**, before the demo, we check the analysis of the main branch, write down the numbers (issues per category, ratings, quality gate) in the retrospective and compare them with the previous sprint.

## 2. Paying back existing technical debt

### Priorities

We fix existing issues in this order:

| Priority | What                                                   | Why                                                                             |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1        | Reliability issues with **High** severity (about 10)   | They are probable bugs that can make the app behave wrongly.                    |
| 2        | **Security** issues (31, mostly Medium)                | They can expose user data. They are also the second reason for the low ratings. |
| 3        | Reliability issues with **Medium** severity (about 32) | Bring the Reliability rating from D to at least B.                              |
| 4        | **Maintainability** issues (8)                         | Already rated A; fixed when we work on the same file.                           |

Inside the same priority we prefer:

- issues in code that we will change soon for a new story (we fix them while we are there);
- issues that are fast to fix (SonarCloud shows an estimated effort for each issue);
- the **backend** before the frontend when the severity is the same, because backend issues affect data and every client.

Issues that are false positives or that do not apply to us (for example the Python script used to generate Figma mockups in `App/figmaPrototype/scripts`) are marked on SonarCloud as _Accepted_ or _False positive_, with a short reason, after a second team member agrees. They are not deleted silently.

### Time budget and owners (Sprint 3)

| Area                | Time       | Owner                         |
| ------------------- | ---------- | ----------------------------- |
| Backend TD payback  | 1 h 30 min | Beatrice Marana, Roki Rrotani |
| Frontend TD payback | 1 h 30 min | Beatrice Marana, Roki Rrotani |

These hours are in addition to the 30 + 30 minutes of SonarCloud checks for each user story. At the next planning we decide the budget for the following sprint, based on how many issues are left.

### Workflow for a TD fix

1. At sprint planning the owners choose the issues for the sprint, starting from the top of the priority list, until the time budget is full.
2. They create a branch from `dev` named `td/<short-description>` (for example `td/backend-reliability-high`).
3. They fix the issues and run the tests (`npm test` in `App/backend` and `App/frontend`).
4. They open a pull request to `dev` with the list of SonarCloud issues fixed (link or rule name) in the description.
5. They do the SonarCloud check on their own PR, as for a story. Another team member reviews it and merges it.
6. The issues disappear from SonarCloud after the analysis of the merged code.

### TD backlog

Issues that are not fixed in the sprint in which they are found (new issues accepted during a review, or old issues not yet planned) stay on SonarCloud, which is our TD backlog. We do not copy them elsewhere. When a developer postpones a new issue, they write it in the PR comment so that it is visible at the next planning.

## Goals

| By                | Goal                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| End of Sprint 3   | Quality gate **passed**. No High reliability issues open. No new issues added by Sprint 3 stories. |
| End of Sprint 4   | Security rating at least **B**, Reliability rating at least **B**.                                 |
| Following sprints | Keep all ratings at **A** or **B** and duplications under 3%.                                      |

We check these goals at each retrospective and change them if they are not realistic.

## Possible improvements

These are ideas we have not adopted yet. We will decide on them at a retrospective.

- **Coverage on SonarCloud.** Right now SonarCloud shows no coverage because it only reads the code, it does not run our tests. To see coverage we would need to run the tests in an automated pipeline (see the next point) and send the coverage report to SonarCloud.
- **Continuous Integration (CI) with GitHub Actions.** CI means that GitHub runs a script automatically every time someone pushes code or opens a PR: for example, it installs the dependencies, runs the tests and sends the results to SonarCloud. With CI, a PR would show directly whether the tests pass and what the coverage is, without anyone running them by hand.
- **Linter in the frontend.** The frontend has a `lint` script but ESLint is not installed. Making it work would catch some issues before SonarCloud does.
