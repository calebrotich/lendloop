# Commit messages

A commit message is read by the next person who touches the code, and often by
someone who was not in the room: a reviewer, a stakeholder, a future
maintainer. It should explain the change without requiring the diff, a terminal
transcript or internal shorthand.

This repository follows the
[Graphite guide](https://graphite.com/guides/writing-effective-commit-messages-best-practices)
and the Conventional Commits format.

## Format

```text
<type>(<scope>): <summary>

<body>

<footer>
```

The summary is always required. The body is required for anything that is not
obvious from the summary. The footer is optional and only for real references,
such as `Closes #123`.

## Rules

- **Summary:** imperative mood ("add", "fix", "remove"), lowercase unless a
  proper noun is involved, no trailing period, 50 characters or fewer.
- **Body:** leave one blank line after the summary. Explain what changed and why
  it matters. Wrap at 72 characters. Write for a reader who knows the product
  but not the implementation.
- **Scope:** name the area of the product, not a file: `auth`, `tools`,
  `requests`, `admin`, `automation`, `ui`, `docs`, `tooling`.
- **One change per commit.** If the summary needs "and", the commit probably
  needs splitting.
- **No internal references.** Plan labels, ticket IDs and private codenames mean
  nothing to a future maintainer. Say what the change does.
- **No verification transcripts.** Test counts, deployment names, command
  output and "verified against..." lists belong in the pull request or CI. A
  short sentence about what was tested is enough, and only when it changes how
  the reader understands the change.
- **No secrets or personal data.** Never include a key, token, real email or
  customer detail.

## Types

| Type       | Use for                                       |
| ---------- | --------------------------------------------- |
| `feat`     | a user-visible capability                     |
| `fix`      | a defect fix                                  |
| `docs`     | documentation only                            |
| `refactor` | a change that does not alter behaviour        |
| `perf`     | a performance improvement                     |
| `test`     | tests only                                    |
| `build`    | build tooling or dependencies                 |
| `ci`       | CI configuration                              |
| `chore`    | maintenance that does not fit the types above |

## Examples

Good:

```text
feat(requests): add the borrow request lifecycle

Borrowers request a tool for a date range. Owners approve
or decline, and either party can mark the tool returned.

Requests are validated: the window cannot start in the
past or run longer than 30 days, and it cannot overlap an
approved loan or a duplicate pending request. Approval
rechecks the overlap in the same step that changes the
status, so the same tool cannot be double-booked.

Availability is calculated from approved loans when the
data is read. A tool that is out is hidden from the public
shelf, and an overdue loan still shows as on loan until it
is returned.
```

Bad:

```text
feat(requests): loan lifecycle

- added a bunch of stuff
- fixed the validation
- tests pass
```

The second message is vague, mixes several changes and spends
its body on implementation detail rather than user impact. A
reader learns what the code does only by reading the diff.

## What the reader should be able to answer

After reading the summary and body, a reviewer or stakeholder should know:

1. What can a user do now that they could not do before?
2. Why was the change needed, or what problem does it prevent?
3. What trade-off or limitation should they know about?

If the answer is only in the diff, the message is not finished.

## Where everything else goes

- **Product rationale:** `docs/` and the pull request.
- **Test results and deployment checks:** the pull request and CI.
- **Design decisions and trade-offs:** `docs/` and the pull request.
- **Change history:** [`docs/changelog.md`](changelog.md).
