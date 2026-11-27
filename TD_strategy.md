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

1. One member implements the **backend** on a feature branch (`mhxx/feat/...`) and opens a pull request to `dev`.
2. The same member does the **SonarCloud TD check** on the backend PR and fixes the new issues on the same branch (see below).
3. Another member **reviews** the PR, leaves comments on it and checks that the SonarCloud comment is there.
4. Another member writes the backend unit, integration and end-to-end tests on the same branch and checks the **coverage** of the new code on SonarCloud (see below).
5. One member implements the **frontend**, does the SonarCloud TD check on the frontend PR, and another member reviews the PR.
6. Another member writes the frontend unit and integration tests on the same branch and checks the **coverage** of the new code on SonarCloud.
7. If the review is positive and the merge rule below is respected, the reviewer **merges** the PR into `dev`.
8. One member checks that the whole story works and updates the documentation.

### How we use SonarCloud

SonarCloud is connected to our GitHub repository through a GitHub Actions workflow (`.github/workflows/sonarcloud.yml`). On every pull request and every push to `dev` and `main`, GitHub runs all our backend and frontend tests with coverage and then sends the code and the coverage report to SonarCloud. Nobody has to start the analysis or the tests by hand.

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
  The Python script used to generate the Figma mockups (`App/figmaPrototype`) is not part of the application, so we excluded it from the analysis in `sonar-project.properties`. Other issues that are false positives or that do not apply to us are marked on SonarCloud as _Accepted_ or _False positive_, with a short reason, after a second team member agrees. They are not deleted silently.

### SonarCloud check on each user story

From Sprint 3 on, each user story has **two extra estimated tasks**:

| Task                          | Estimate | Who                                        | When                                                    |
| ----------------------------- | -------- | ------------------------------------------ | ------------------------------------------------------- |
| SonarCloud TD check, backend  | 30 min   | the developer who writes the backend code  | after opening the backend PR, before asking for review  |
| SonarCloud TD check, frontend | 30 min   | the developer who writes the frontend code | after opening the frontend PR, before asking for review |

During this check the developer:

1. Opens the PR analysis on SonarCloud (from the bot comment or the Pull Requests tab, see above). SonarCloud does not comment line by line in the code, so the issues are read there.
2. Looks at the issues **introduced by the PR**, following the priorities above:
   - **High** reliability issues and any security issue must be fixed before merge;
   - **Medium/Low** issues should be fixed before merge; if the fix is not reasonable now, the developer lists it in a PR comment and it goes in the TD backlog (see below);
   - new **security hotspots** must be reviewed (marked _Safe_ or _Fixed_) on SonarCloud.
3. Checks duplications in the new code (we want to stay under 3%).
4. Fixes the issues on the same branch and writes a short comment on the PR: `SonarCloud: OK` or the list of issues still open.
   The developer does not check coverage, because the tests are written later by another member. At this point the quality gate can be red only because of coverage: this is expected and does not block the review.

### Coverage check by the tester

The member who writes the tests, after pushing them on the story's branch, opens the PR analysis on SonarCloud and checks the **coverage of the new code** (the quality gate asks for at least 80%). If it is lower, they add tests for the uncovered lines (SonarCloud shows them in red in the _Code_ view of the PR), then write `Coverage: OK` on the PR or explain why it stays lower. This is part of the test task, so it has no separate estimate.

**Merge rule:** the reviewer merges only if the "Tests and SonarCloud" check is green, the `SonarCloud: OK` and `Coverage: OK` comments are there and the PR adds no new High reliability or security issues.

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
