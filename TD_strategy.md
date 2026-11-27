# Technical Debt Strategy | Team 09

## Starting point

The first analysis, run on 22 November 2026 (about 28k lines of code, JavaScript), gave these results:

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
- **No extra PRs for story-related TD.** Issues introduced by a user story are fixed on the story's own branch and checked in the story's own PR review. Only the payback of existing debt has its own `td/...` branch and pull request.
- **Tests must stay green.** A refactoring that fixes an issue must not break the existing unit, integration and end-to-end tests.

## Managing technical debt

### Our workflow per user story

Our sprints last two weeks and the team has five members. For each user story:

Each story has a main branch `mhXX/feat/main`. The work is done on sub-branches (`mhXX/feat/backend`, `mhXX/feat/frontend`, `mhXX/feat/test/backend`, `mhXX/feat/test/frontend`), each merged into `mhXX/feat/main` with a **sub-PR**. At the end, `mhXX/feat/main` is merged into `dev` with the **story PR**.

1. One member implements the **backend** on `mhXX/feat/backend` and opens a sub-PR to `mhXX/feat/main`.
2. The same member does the **SonarCloud TD check** on the backend sub-PR and fixes the new issues on the same branch (see below).
3. Another member **reviews** the sub-PR, leaves comments on it and checks that the SonarCloud comment is there.
4. Another member writes the backend unit, integration and end-to-end tests on `mhXX/feat/test/backend` and opens a sub-PR to `mhXX/feat/main`.
5. One member implements the **frontend** on `mhXX/feat/frontend`, does the SonarCloud TD check on the frontend sub-PR, and another member reviews it.
6. Another member writes the frontend unit and integration tests on `mhXX/feat/test/frontend` and opens a sub-PR to `mhXX/feat/main`.
7. When the story is complete, a member opens the story PR from `mhXX/feat/main` to `dev`, and the members who wrote the tests check the **coverage** of the new code on it (see below).
8. If the review is positive and the merge rule below is respected, the reviewer **merges** the story PR into `dev`.
9. One member checks that the whole story works and updates the documentation.

### How we use SonarCloud

SonarCloud is connected to our GitHub repository through a GitHub Actions workflow (`.github/workflows/sonarcloud.yml`). On every pull request (sub-PRs included) and every push to `dev` and `main`, GitHub runs all our backend and frontend tests and then sends the code to SonarCloud. The **coverage report** is sent only for pull requests into `dev` or `main` and for pushes to `dev` and `main`: on sub-PRs the tests are often not written yet, so the quality gate does not check coverage there. Nobody has to start the analysis or the tests by hand.

A few minutes after a PR is opened (and after every new push), we see two things on GitHub:

- **A comment from the SonarCloud bot.** It shows whether the quality gate passed or failed, and how many new issues, security hotspots and duplications the PR introduces.
- **The "Tests and SonarCloud" check** at the bottom of the PR, marked ✓ or ✗. If it is ✗, a test failed: we open the check (or the **Actions** tab) to see which one.
- **The "SonarCloud Code Analysis" check**, next to it, marked ✓ or ✗ depending on the quality gate.

To see each issue in detail, we click "See analysis details" in the bot comment. We can also open the project on sonarcloud.io and go to the **Pull Requests** tab. There every issue is listed with its file, line and explanation, and we can mark it as Accepted or False positive (with a reason).

### Priorities

The same priorities apply both to new issues found in a PR and to existing issues we pay back:

| Priority | What                                        | Why                                                            |
| -------- | ------------------------------------------- | -------------------------------------------------------------- |
| 1        | Reliability issues with **High** severity   | They are probable bugs that can make the app behave wrongly.   |
| 2        | **Security** issues                         | They can expose user data. They keep the Security rating at C. |
| 3        | Reliability issues with **Medium** severity | Bring the Reliability rating from D to at least B.             |
| 4        | **Maintainability** issues                  | Already rated A; fixed when we work on the same file.          |

At the starting point there were about 10 High reliability issues, 31 security issues, about 32 Medium reliability issues and 8 maintainability issues.

Inside the same priority we prefer:

- issues in code that we will change soon for a new story (we fix them while we are there);
- issues that are fast to fix (SonarCloud shows an estimated effort for each issue);
- the **backend** before the frontend when the severity is the same, because backend issues affect data and every client.

The Python script used to generate the Figma mockups (`App/figmaPrototype`) is not part of the application, so we excluded it from the analysis in `sonar-project.properties`. The test code (`App/backend/tests`, `App/frontend/tests`) is still analysed, so issues in tests are shown and fixed like the others, but it is excluded from coverage and from duplications: tests are not code to be covered, and similar test cases would push duplications over 3%. Other issues that are false positives or that do not apply to us are marked on SonarCloud as _Accepted_ or _False positive_, with a short reason, after a second team member agrees. They are not deleted silently.

### SonarCloud check on each user story

From Sprint 3 on, each user story has **two extra estimated tasks**:

| Task                          | Estimate | Who                                        | When                                                    |
| ----------------------------- | -------- | ------------------------------------------ | ------------------------------------------------------- |
| SonarCloud TD check, backend  | 30 min   | the developer who writes the backend code  | after opening the backend sub-PR, before asking for review  |
| SonarCloud TD check, frontend | 30 min   | the developer who writes the frontend code | after opening the frontend sub-PR, before asking for review |

During this check the developer:

1. Opens the sub-PR analysis on SonarCloud (from the bot comment or the Pull Requests tab, see above). SonarCloud does not comment line by line in the code, so the issues are read there.
2. Looks at the issues **introduced by the PR**, following the priorities above:
   - **High** reliability issues and any security issue must be fixed before merge;
   - **Medium/Low** issues should be fixed before merge; if the fix is not reasonable now, the developer lists it in a PR comment and it goes in the TD backlog (see below);
   - new **security hotspots** must be reviewed (marked _Safe_ or _Fixed_) on SonarCloud.
3. Checks duplications in the new code (we want to stay under 3%).
4. Fixes the issues on the same branch and writes a short comment on the PR: `SonarCloud: OK` or the list of issues still open.

The developer does not check coverage, because the tests are written later on separate branches. Coverage is not sent to SonarCloud on sub-PRs, so it does not make their quality gate red.

### Coverage check on the story PR

Coverage is checked only on the **story PR** (`mhXX/feat/main` → `dev`) and on pull requests from `dev` to `main`. The members who wrote the tests open the story PR analysis on SonarCloud and check the **coverage of the new code** (the quality gate asks for at least 80%). If it is lower, they add tests for the uncovered lines (SonarCloud shows them in red in the _Code_ view of the PR), then write `Coverage: OK` on the story PR or explain why it stays lower. This is part of the test task, so it has no separate estimate.

Before pushing, they can already see the coverage locally with `npm run test:coverage` in `App/frontend`. It prints a table in the terminal and writes an HTML page in `App/frontend/coverage/index.html`.

**Merge rules:**

- A **sub-PR** is merged into `mhXX/feat/main` only if the "Tests and SonarCloud" check is green, the `SonarCloud: OK` comment is there (for code sub-PRs) and the sub-PR adds no new High reliability or security issues.
- The **story PR** is merged into `dev` only if, in addition, the quality gate is green and the `Coverage: OK` comment is there.

### Paying back existing debt

#### Time budget and owners (Sprint 3)

| Area                | Time       | Owner           |
| ------------------- | ---------- | --------------- |
| Backend TD payback  | 1 h 30 min | Beatrice Marana |
| Frontend TD payback | 1 h 30 min | Roki Rrotani    |

These hours are in addition to the 30 + 30 minutes of SonarCloud checks for each user story. At the next planning we decide the budget for the following sprint, based on how many issues are left.

#### Workflow for a TD fix

1. At sprint planning the owners choose the issues for the sprint, starting from the top of the priority list, until the time budget is full.
2. They create a branch from `dev` named `td/<short-description>` (for example `td/backend-reliability-high`).
3. They fix the issues and run the tests locally (`npm test` in `App/backend` and `App/frontend`). The tests run again automatically on the PR.
4. They open a pull request to `dev` with the list of SonarCloud issues fixed (link or rule name) in the description.
5. They do the SonarCloud check on their own PR, as for a story. Another team member reviews it and merges it.
6. The fixed issues disappear from the SonarCloud analysis of `dev` right after the merge, and from `main` at the end of the sprint.

### TD backlog

Issues that are not fixed in the sprint in which they are found (new issues accepted during a review, or old issues not yet planned) stay on SonarCloud, which is our TD backlog. We do not copy them elsewhere. When a developer postpones a new issue, they write it in the PR comment so that it is visible at the next planning.

### Sprint level checks

- At the **start of each sprint**, during planning, we look at the SonarCloud dashboard of `dev` and choose which existing issues to pay back in the sprint.
- **During the sprint** we can follow the analysis of `dev` to see if the numbers are improving.
- At the **end of each sprint**, after merging `dev` into `main`, we check the SonarCloud analysis of `main`, write down the numbers (issues per category, ratings, quality gate) in the retrospective and compare them with the previous sprint.

## Goals

| By                | Goal                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| End of Sprint 3   | Quality gate **passed**. No High reliability issues open. No new issues added by Sprint 3 stories. Coverage reported on SonarCloud. |
| End of Sprint 4   | Security rating at least **B**, Reliability rating at least **B**.                                                                  |
| Following sprints | Keep all ratings at **A** or **B** and duplications under 3%.                                                                       |

We check these goals at each retrospective and change them if they are not realistic.
