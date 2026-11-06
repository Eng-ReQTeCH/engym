# Engym 1.0 independent release review

Review date: 2026-11-06. Reviewer: independent release-judge agent. This review supersedes the historical UI implementation scores in REVIEW.md. It assesses the current README and implementation, rather than assuming every historical feature still exists.

## Decision

**Hold public release pending the two code findings below and the real deployment/device launch checks.** Local development is demonstrably functional. A passing browser suite does not establish that the Docker image, Cloudflare Tunnel or installed mobile app has run successfully.

| Dimension | Score / 10 | Reason |
|---|---:|---|
| Gym-rat appeal | 6.5 | Strong offline logging, previous-session weights, routines and community. The current picker omits the essential barbell lifts and completed logging mistakes cannot be corrected. |
| Overall app completeness | 7.0 | Account, offline storage, automatic restore, journal and community work. Basic logging correction and exercise coverage still need work; advanced progression analysis is absent. |
| Apparent effort / polish | 8.0 | Cohesive dark/lime styling, real local exercise media, mobile logging controls, honest empty/offline states, moderation and deployment documentation show substantial implementation effort. |
| Production readiness | 6.0 | Automated checks pass, deployment configuration is plausible and snapshots are tested. The public service does not yet exist, and Docker/tunnel/physical installation remain unverified. |

Scores are evidence-based judgments, not percentages of a predefined feature list. They should be updated after the fixes are independently checked.

## Required code fixes

### R1 — Correct or remove completed logging mistakes (P2)

`client/workout.js:8` selects the first unfinished set; `client/flow.js:37` renders completed sets as read-only text in the summary. There is no completed-session deletion control in the journal. A wrong weight/repetition entry, accidental extra set or accidentally finished session therefore becomes permanent through the supplied UI, including its effect on published volume.

Add guarded editing/removal of completed sets and confirmed deletion of an accidental completed workout. Preserve local-first writes and conflict copies. Explain that an existing published snapshot does not change until deliberate republication; session deletion should remove its public post/ranking contribution when synchronized. Verify correction offline, reload, reconnection, second-browser restore, and publication semantics.

### R2 — Make essential barbell lifts selectable (P2)

`client/flow.js:14` builds the user-visible exercise list from `commonExercises` only. `shared/domain.mjs` also defines barbell squat, bench, deadlift, overhead press and row in `catalog`, but those entries are unreachable in the current builder/library. There is also no custom-exercise authoring UI to work around this. A regular barbell program cannot be represented faithfully.

Expose the deduplicated catalog, with accurate exercise names/media/instructions or a clearly generic fallback. Do not substitute a dumbbell/machine illustration and imply it depicts a barbell lift. Verify an offline squat/bench/deadlift routine from creation through completion and automatic backup/restore.

## Launch gates requiring the deployment owner

1. On the actual Docker host, build and start the base plus tunnel override. Confirm the non-root service can initialize and persist the named volume, restart cleanly, pass health checks and generate verified snapshots. Perform a separate-volume restore drill. Docker is unavailable in this environment.
2. Supply the actual tunnel secret and publish `https://engym.minaghali.xyz`. Verify HTTPS, same-origin cookies, signup/login, automatic backup/restore, real proxy IP handling and that no origin port is publicly exposed. The domain is not live yet. The fixed client URL and Compose configuration are source-reviewed, not remotely exercised.
3. Install on real iPhone/Safari and Android/Chrome. Close/reopen offline, finish a workout, reconnect and verify a second device restores it. Check camera/photo formats, safe areas, keyboard behavior and an application update. Desktop Chromium service-worker testing is useful but is not this device test.
4. If Google login is enabled, test real credentials and the exact HTTPS callback. Automated tests use a mock Google provider. Otherwise retain the hidden Google button.

Owner off-machine encrypted copies, disk/health monitoring and moderation handling are operational requirements documented in README. Same-volume snapshots do not protect against losing the host/volume.

## Verified evidence

- Independently ran `npm test`: 8/8 passed. Coverage includes account isolation, idempotent sync/conflicts, immutable public snapshots, ranking consent, gym membership, profile photo validation, origin/cookie protections, password-session revocation, Google PKCE/state and SQLite snapshot restoration.
- Independently ran `node tests/release-browser.mjs`: passed against a temporary database/server and fresh Chromium contexts. Verified offline reload/workout/journal, treadmill data, unit switching, ignored stored server override, removed customer backup controls, automatic reconnection sync and second-browser restore.
- Independently ran `node tests/community-browser.mjs`: passed against disposable data. Verified honest guest/empty states, gym creation, profile photo upload, real publication and interaction paths covered by the suite.
- Read current client/store/domain/server/backup/build/Compose/Docker sources and README. Inspected actual mobile community, compact rest and profile screenshots. These are targeted release visuals, not a claim of a fresh full 15-page device matrix.
- The profile screenshot initially contained a replacement glyph in its version separator. The builder corrected the UTF-8 source and rebuilt; final artifact refresh remains to be checked with the code fixes.

The initial restricted browser launch failed because Chromium could not start under that launcher; the approved normal browser execution subsequently passed. This was an environment limitation, not an observed application failure.

## Missing features and practical limits

These reduce the product scores but are not automatically blockers for a deliberately scoped 1.0: exercise progression/PR graphs; supersets and warm-up/drop-set types; custom exercise authoring; self-service forgotten-password email; in-app account switching on a browser already bound to another account; older-feed pagination. No supplied exercise videos exist. The current journal is primarily a photo/notes/session history, rather than an analytics dashboard.

Closed-app synchronization/rest notifications are explicitly not promised. Unsynchronized browser data can still be lost if the OS/user removes storage. The client is locked to the production origin outside loopback development; users cannot configure servers, import/export backups, manually trigger a backup or clear device storage through the app.
