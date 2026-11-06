# Independent review — Engym

## Round 1 — changes required

Reviewed 2026-11-01. This review covers the implementation and screenshots available before the builder's subsequent fixes; those fixes require round 2. Target is 95 in every required dimension, maximum ten rounds. Scores do not waive blockers. The instruction to preserve the supplied UI takes precedence over redesign preferences.

### Evidence inspected

- Source: `BUILD-CONTRACT.md`, `README.md`, `client/app.js`, `client/store.js`, `client/app.css`, `shared/domain.mjs`, `server/index.mjs`, `server/admin.mjs`, `scripts/build.mjs`, Docker/Compose files, and both test files.
- Actual images: all 15 `test-results/<page>-390.png` and `<page>-1440.png`; empty phone states for analytics, check-in, feed, rankings, routines and exercises; `offline-summary-phone.png`; `conflict-modal.png`. Reference HTML and the supplied signup screenshot were consulted. No pixel-perfect equivalence is claimed.
- Builder's recorded checks: build passed, three domain/API tests passed, and real Chromium flow passed. `browser-report.json` contains no recorded page errors or horizontal overflows and covers offline capture/reload/finish, account registration, publication, second-device restore, stale-server-edit conflict handling, and export/import. These are inspected results, not independent reruns by this reviewer.
- Screenshot identities at this review are recorded in `test-results/review-evidence-round1.json`. Some captures show active CSS transitions; settled replacement evidence is needed.

### App scores

| Dimension | Score | Reason |
|---|---:|---|
| Usefulness | 93 | A useful real offline workout loop exists, including backups and optional social publication. |
| Completeness | 83 | Several visible controls/data states remain inconsistent, and history is truncated. |
| Robustness | 65 | The current live-editor synchronization path can silently overwrite a remote edit; publication can expose private record fields and later private changes. |

### Page scores

Scores reflect the lower-quality observed state across phone/desktop. Existing supplied template density/desktop stretching is documented rather than treated as permission to redesign.

| Page | Layout | Content load | Observations |
|---|---:|---:|---|
| Welcome | 96 | 95 | Visual hierarchy retained; velocity/Google claims require honest qualification. |
| Sign up | 95 | 92 | Original form retained; availability/security badges are still static even for empty fields. |
| Login | 95 | 92 | Main flow is clear; static cloud latency/security labels and redundant quick identity remain. |
| Goals | 95 | 91 | Original cards retained, but selected visuals can disagree with saved selection. |
| Experience | 95 | 91 | Original layout retained; initial check states survive selecting another option. |
| Baseline | 93 | 76 | Zero baselines coexist with fabricated Wilks, tier, strength and percentile values. Unit handling is inconsistent. |
| Active workout | 95 | 94 | Logger and restored timer are useful; action dock is now reachable. Zero-rest configuration is ignored. |
| Routine planner | 95 | 93 | Layout retained and scheduling editor exists; displayed active/template statistics need consistent binding. |
| Analytics | 94 | 86 | Real totals/history exist; anatomy coloring does not correspond to the actual muscle distribution. |
| Exercise library | 95 | 94 | Searchable actual records, useful empty states. Latest-eight spark selection is reversed for longer histories. |
| Exercise detail | 95 | 88 | Core add/favorite/history paths exist; calibration control is dead and non-squat metadata/guides need checking. |
| Community feed | 95 | 92 | Original post structure retained, real interactions wired; raw live backup records should not be the public payload. |
| Rankings | 82 | 83 | Hydration duplicates handles into metrics/unit/session slots, making podium/rows confusing on phone. |
| Check-in | 94 | 82 | Composer is functional, but a public draft can look Friends-only. Privacy state is a blocker. |
| Recap | 95 | 92 | Real session totals and export exist. The source QR remains a decorative mock rather than a working routine link. |

### Required fixes

1. **P1 — preserve edits across a pull while a screen is open.** `sync()` applies server data to IndexedDB while `active.data` and `profile` retain their prior snapshots. `store.save()` then takes the newest database version and writes the stale in-memory object against it, so the server accepts the overwrite without a conflict. Guard saves against the snapshot the editor loaded, or reconcile/refresh the open editor before saving. Test remote edit → pull → stale local UI edit, not only remote edit → local save before a pull.
2. **P1 — make public records explicit snapshots.** `/api/feed` returns the live workout backup object wholesale, including logger notes and subsequent private edits. Persist a sanitized published snapshot and use it for feed/rankings; omit private notes and unrelated record fields. Test a private edit after publication and assert the public payload is unchanged until Publish is used again.
3. **P1 — align audience state with what is published.** `initCheckin()` restores `data.visibility` but leaves Friends' original lime class. Clicks add an outline without changing the original selected class. The inspected fixture was published to Everyone while the screenshot still showed Friends as selected. Restore and update active classes, ARIA state and publish text on every change/load.
4. **P2 — correct units and baseline data.** Baseline values are canonical pounds but displayed without conversion when revisited in KG, then multiplied again on saving. Switching units reinterprets the visible number; profile unit changes also reinterpret bodyweight. Convert values/labels while preserving the physical measurement. Replace fabricated baseline numeric/tier/percentile claims with actual or empty values. Add a KG → reload → save round-trip check.
5. **P2 — wire remaining visible states.** Bind detail's `LOG CUSTOM 1RM CALIBRATION`; synchronize pickGroup check/indicator classes with actual values; hydrate podium and standings semantic fields individually. Include actual nondefault selections in browser checks.
6. **P2 — respect saved routine configuration.** `routine.restSeconds || 120` converts a valid zero-second rest to two minutes. Use nullish/default semantics. Ensure saved active routine and its displayed badge agree.
7. **P2 — keep analytics/history truthful and reachable.** Every anatomy path is shaded the same whenever any volume exists, even for a chest-only workout; bind known groups or use a neutral diagram. Analytics silently cuts history at 30 with no next-page action. The library takes `slice(-8)` from descending history, excluding the newest points in a long history.

### Remaining verification and scope limits

- Docker is unavailable here. Dockerfile/Compose and Caddy configuration were inspected, but an actual image build, non-root volume startup, container restart/restore and TLS deployment are unverified.
- Browser offline behavior is evidenced; physical Android/iOS installation, OS storage eviction and installed-app update lifecycle are not verified.
- Google OAuth is not implemented/configured, no exercise video was supplied, and the displayed QR is a mock. The UI explains Google/video limitations, but these must not be described as working integrations.
- Cross-site API origins may fail with SameSite/third-party-cookie restrictions. Serving frontend/API from the Docker host's same HTTPS origin is the documented reliable topology.
- Source files in `ui/` are retained; the invalid original logo asset uses a disclosed local E fallback. Existing template desktop stretching and content density remain due to the user's preservation requirement.

**Round 1 gate: not passed.** A working core is evidenced, but the data-loss and audience/publication findings must be resolved and retested before acceptance. Platform checks remain explicitly unverified even after implementation fixes.

## Round 2 — implementation review passed; deployment/device checks pending

Reviewed the revised source and refreshed evidence on 2026-11-01. Round 1 is retained above as the historical review, not a description of the final implementation. No implementation files were edited by this reviewer.

### Evidence and fixes verified

- Independently reran `npm test` against the final source: **5/5 passed**, including request count/UTF-8 byte batching, Google single-use state/PKCE exchange with a mock provider, account isolation, retry receipts, conflict responses, restart persistence, immutable public snapshots, private-note exclusion, and leaderboard consent revocation.
- Inspected the final successful Chromium report: **no recorded page errors or horizontal overflows**. The expanded browser run covers offline save/reload/finish, restored favorites, signup/publication, second-device restore, server conflicts and local conflict recovery, the precise open-view remote-pull/stale-edit case, KG reload/save and optional OHP retention, nondefault onboarding restoration, semantic My Gym filtering, audience restoration, routine QR import, zero rest/discard, and export/import.
- Re-inspected all 15 phone screens and all 15 desktop screens during this round, with focused rechecks of baseline, goals, experience, rankings and check-in after the final binding fixes. Reduced-motion captures remove the previous transient chart widths. Empty/offline/conflict captures and source remain part of the review. Final file identities are in `test-results/review-evidence-round2.json`.
- `saveGuarded` compares the loaded data snapshot transactionally; stale edits are retained as conflict copies instead of receiving the newest version and silently overwriting it. The active editor serializes saves. Routine editors now hydrate from the latest stored record before establishing their baseline.
- Public posts now store a whitelist-based immutable snapshot. Private logger notes and later backup edits stay outside public payloads. Rankings read published snapshots and require an explicit `profile.broadcast === true` opt-in; opting out removes ranking entries while retaining feed posts.
- Audience classes, ARIA state and publish wording agree with the saved audience. Onboarding uses stable values and restores selected indicators on return. My Gym/period/metric actions use semantic data attributes rather than their displayed wording.
- Unit conversion retains the physical baseline measurement through a KG reload/save cycle; optional OHP keys survive completion. Fake baseline rankings were neutralized. Detail calibration is wired. Zero rest uses a nullish default. Older history is reachable and sparks select the latest eight records.
- Anatomy remains in the supplied layout as a neutral, labeled reference rather than a fabricated load measurement. The recap QR is generated locally and carries an actual preview/import link without private notes or weights; the exported PNG includes it.

### Final app scores

| Dimension | Score | Assessment |
|---|---:|---|
| Usefulness | 96 | Complete local training loop, backup recovery and optional server community functions. |
| Completeness | 95 | Requested implementation is connected; remaining external-media/platform limits are explicitly bounded below. |
| Robustness | 95 | Critical overwrite, publication privacy and consent issues resolved with focused regressions. |

### Final page scores

These are expert review judgments for the implementation within the user's requirement to preserve the provided templates, not a claim of exhaustive device coverage or a redesigned layout.

| Page | Layout | Content load |
|---|---:|---:|
| Welcome | 96 | 95 |
| Sign up | 95 | 95 |
| Login | 95 | 95 |
| Goals | 95 | 95 |
| Experience | 95 | 95 |
| Baseline | 95 | 95 |
| Active workout | 96 | 95 |
| Routine planner | 95 | 95 |
| Analytics | 95 | 95 |
| Exercise library | 95 | 95 |
| Exercise detail | 95 | 95 |
| Community feed | 95 | 95 |
| Rankings | 95 | 95 |
| Check-in | 95 | 95 |
| Recap | 95 | 95 |

The original mobile-oriented cards, typography, navigation and desktop stretching remain. Some inherited explanatory/forecast labels are static blueprint copy; they should not be interpreted as sensor readings or a verified adaptive training prescription. Long names may truncate in the supplied compact title slots, while the underlying records remain accessible. Those are bounded template constraints, not a request to change the UI.

### Remaining verification gaps and media limits

1. **Docker execution and remote HTTPS deployment are unverified.** Docker is not installed in this environment. Source/Compose inspection is not an image build, volume/restart/restore test or deployment on the user's other machine. Run those documented commands on the target Docker host.
2. **Physical installed-device behavior is unverified.** Chromium exercised real service-worker offline navigation and persistence. Android/iOS home-screen installation, OS eviction, camera/QR scanning and installed-app update behavior still need device checks. Closed-app synchronization/alarms are not promised.
3. **Live Google OAuth is unverified.** The implemented server flow passed a mock-provider integration test; real Google credentials, authorized redirect URI and HTTPS hostname must be configured and exercised by the server owner.
4. **No exercise video was supplied.** The original play control honestly explains the supplied still-image/written guide. A streamed exercise video is not implemented or claimed.
5. **Cross-site cookie restrictions still apply.** The documented same-HTTPS-origin frontend/API topology is the reliable deployment. Arbitrary separate browser origins are not claimed to work through every browser's third-party-cookie policy.

**Round 2 implementation gate: passed.** No unresolved blocking code defect was found in the reviewed required flows. Full deployment/physical-device acceptance remains pending the checks above; the scores do not mark those tests as performed. The final running preview must use the restarted current server, not only refreshed static files.
