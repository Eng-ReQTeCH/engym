# Engym build contract

Preserve all 15 supplied UI templates, typography, colors, spacing and navigation styles. Replace illustrative records with truthful saved data. New settings/edit dialogs use the existing visual language where templates contain triggers but no implementation.

Core loop: guest or account → onboarding → choose/edit routine → log sets offline → finish → recap → analytics/history → optional explicit social publication.

Device source of truth: IndexedDB records with stable IDs, durable mutation queue, transactional writes. Server: authenticated SQLite, account isolation, idempotent versioned per-record sync, conflict copies rather than silent data loss. Account signup/login are online; guest tracking and onboarding are offline. No automatic public sharing. Session cookies are HttpOnly on same origin; cross-origin bearer sessions held only in memory require login after reload. Store no passwords locally.

PWA caches all 15 pages, scripts, styles, fonts and images. HTTPS or localhost is required for installation/service workers. Docker hosts frontend and API together by default; optional different server URL is in profile settings. Local dates use the device timezone; timestamps are UTC.

Required evidence: domain/API tests for auth, isolation, sync retries/conflicts, restart, social visibility and rankings; real-browser local capture/reload/offline navigation and backup/restore; all-screen desktop/phone captures. Docker execution depends on installed Docker (currently absent). Physical mobile installation remains a device check.

Review gate: independent source and screenshot review, five rubric dimensions, target 95 each, maximum ten rounds. Preserve supplied layout even when reviewer would prefer redesign; disclose resulting limitations.


## Recorded acceptance evidence

- `npm run build`: compiled all 15 screens; cached local fonts/images and generated 180/192/512 PNG install icons.
- `npm test`: 5 passing tests covering calculations, ranking eligibility/date validation, authentication, account isolation, sync retries/conflicts, durable restart, tombstones, post visibility and reactions.
- `npm run test:browser`: passed Chromium flow; `test-results/browser-report.json` has no uncaught page errors or horizontal overflow. Offline log/finish/reload, favorites, UI registration, publication, second-device restore, stale-edit conflict resolution, and JSON export/import all exercised against disposable data.
- Phone 390x844 and desktop 1440x1000 screenshots for all 15 pages; empty core/social/composer states at both widths. Evidence under `test-results/`.
- Original `ui/` files were never modified.
- Documented `npm start` is running at http://localhost:8080; `/api/health` verified. Live-entrypoint browser save/reload and manifest check recorded separately under `test-results/handoff-live-server.png`.
- Docker executable is absent: container build/start and HTTPS issuance remain unverified. Installed Android/iOS OS behavior remains unverified; Chromium service-worker/offline behavior is verified.
- Google OAuth server flow is implemented with PKCE and state-binding tests; live credentials remain unconfigured. Motion-video files were not supplied; the existing play control explains the still-image/written-guide path.
- Independent review round 1 found sync/privacy/state defects. Guards for stale in-memory editors, immutable public snapshots, audience/units selection and real QR imports were added and regression-tested. Round 2 uses regenerated reduced-motion screenshots; bounded follow-up fixes cover optional OHP retention, fresh routine-editor reads, semantic gym filters and nondefault onboarding state restoration. final matrix and platform gaps belong in REVIEW.md.

- Final privacy verification: leaderboard participation requires explicit profile.broadcast opt-in; API test verifies revocation removes rankings but retains the explicit feed post.
- Final UI browser regressions additionally cover KG reload/re-save, optional OHP retention, nondefault onboarding state restoration and semantic My Gym filtering.
