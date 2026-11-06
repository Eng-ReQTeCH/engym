# Engym 1.0

Engym is a local-first workout tracker with an online training community. The production service is **https://engym.minaghali.xyz**. It is not deployed yet. Customers cannot configure a server, import/export backups, or clear device storage from the app. Only the owner changes `client/config.js` and deployment environment variables. Loopback development uses the local server automatically.

## Features

- Empty starting library of routines; create your own ordered workout with exercise images, sets, reps, rest and treadmill duration/speed.
- Mobile grip reordering, desktop drag and drop, accessible up/down controls, search, edit and delete. Add your own custom exercises.
- Resume paused workouts, per-set completion/rest/logging, kg/lbs switch, previous-session weights, extra sets, finish early. Correct or remove logged sets and delete accidental sessions with guarded offline saves. Deleting a workout also removes its published post when synced; other corrections require deliberate republishing to update public stats.
- Photo-first journal, private notes, difficulty out of ten, logged-set review.
- Profile photos, friends, kudos, comments, explicit workout publication, reports and blocking.
- Gym creation/search, one joined gym per account, friends/gym/global rankings with volume or streak and publication/leaderboard consent.
- IndexedDB local saves, installable offline shell/media, automatic signed-in backup/restore, retries and preserved conflict copies.

For server deployment and the Android APK build, start with **DEPLOYMENT.md**. A signed Android APK is available at `release/engym-1.0.0.apk`. It compiled successfully with a portable Android toolchain and passed signature, alignment and package checks; a real-device run and Docker build are still unverified.

## Run locally

Node 22.16+ is required (tested with 22.23.2).

```sh
npm ci
npm run build
npm start
```

Open http://localhost:8080. Training works without an account. Sign up online for automatic backups and community access. A device's records remain associated with its original account; signing into a different account on that same browser is blocked to prevent private workouts from crossing accounts. Use a separate browser profile for another account.

## Deploy using Cloudflare Tunnel

Requirements: Docker Engine, Compose **2.24.4+**, a Cloudflare-managed domain, and an owner-created remotely managed tunnel. No incoming router ports are needed. Do not also run the Caddy override with this setup.

1. Copy `.env.example` to `.env`. Keep `PUBLIC_URL=https://engym.minaghali.xyz`.
2. In Cloudflare's tunnel dashboard, create a published application route: hostname `engym.minaghali.xyz`, service type **HTTP**, service URL **engym:8080** (full origin `http://engym:8080`). This is the Docker service name, not localhost. Let Cloudflare create the hostname's DNS record. Do not place an interactive Cloudflare Access login in front of the app/API.
3. Create a `secrets` directory beside Compose and put only your tunnel's token in `secrets/cloudflare-tunnel-token.txt`. Never commit it. The Cloudflared service reads it as a Compose secret.
4. Run:

```sh
docker compose -f compose.yaml -f compose.tunnel.yaml up -d --build
docker compose -f compose.yaml -f compose.tunnel.yaml ps
docker compose -f compose.yaml -f compose.tunnel.yaml logs --tail=100 engym cloudflared backups
```

The tunnel override removes all host port bindings and enables trusted Cloudflare proxy headers. Base Compose binds only `127.0.0.1:8080`; for base-only local Docker use set `PUBLIC_URL=http://localhost:8080` in `.env`. Never expose a proxy-trusting origin directly to the public network. Cloudflared makes outbound connections; allow the egress required by [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/). Token-file syntax is documented in [Cloudflare run parameters](https://developers.cloudflare.com/tunnel/reference/run-parameters/).

Enable **Always Use HTTPS** for the hostname in Cloudflare. Keep Cloudflare caching at its standard defaults; do not apply a Cache Everything rule to HTML, `/sw.js` or `/api/*`. API responses are private/no-store. HTTPS at the public hostname is required for installation, cookies and offline service workers. API and app must share that hostname.

Google sign-in is disabled in this release. Use an athlete handle/email and password.

## Automatic storage and backups

Device writes queue immediately, retry after changes, every 30 seconds while open, on focus and when connectivity returns. Restoring on another device is automatic after signing in. Conflicting edits are retained in Profile for deliberate resolution. Closed-app synchronization and closed-app rest alarms are not promised. Install after visiting online; a first-ever visit while offline cannot download the app. Browser/OS deletion of storage can still remove unsynced workouts.

Docker persists SQLite in `engym-data`. The `backups` service creates a verified SQLite snapshot at startup and every six hours, keeping 28 snapshots in `/data/backups`. A health check flags snapshots older than one day. Snapshot files contain private account data. This rotation protects against accidental database damage; loss of the host/volume still requires an owner-maintained encrypted off-machine copy. Monitor service health, snapshot failures, disk space and moderation reports.

Owner-only manual snapshot (not exposed in the app):

```sh
docker compose exec engym node server/admin.mjs backup /data/owner-backup.sqlite
docker compose cp engym:/data/owner-backup.sqlite ./owner-backup.sqlite
```

Restore drill: stop `engym`, `backups` and `cloudflared`; preserve the original volume; use a temporary container mounting the volume to replace `engym.sqlite` with a verified snapshot, remove the stale `engym.sqlite-wal` and `engym.sqlite-shm` companions and set ownership to UID 1000; restart the stack. Never replace a database while the app or snapshot service is running. Test this on a separate volume before a real incident.

## Security and moderation

The runtime container is non-root, read-only apart from the data volume, drops Linux capabilities and rotates logs. Server protections include parameterized SQL, salted scrypt, expiring HttpOnly/SameSite cookies, Secure cookies at the configured HTTPS origin, origin checks, CSP, frame denial, request size/time limits, per-client API/auth throttles and validated synced records. Proxy IP headers are trusted only by explicit owner configuration. Leaderboards are community training logs, not verified competitions.

Workouts, photos and notes are private until a user publishes a sanitized snapshot. Friends visibility allows athletes the author follows to read the post; the Friends feed shows authors the viewer follows. Blocking hides both athletes from one another's feeds/search/ranks and removes follows. Reported posts enter an owner moderation queue. Password changes revoke other sessions. Forgotten-password recovery requires owner assistance; no email delivery service is configured.

```sh
docker compose exec engym node server/admin.mjs reports
docker compose exec engym node server/admin.mjs resolve-report REPORT_ID
docker compose exec engym node server/admin.mjs remove-post POST_ID
docker compose exec engym node server/admin.mjs ban HANDLE
docker compose exec engym node server/admin.mjs unban HANDLE
```

To reset a password, supply it via stdin to `docker compose exec -T engym node server/admin.mjs reset-password HANDLE`. Do not put passwords in command arguments or tickets. This revokes all sessions. These commands are owner shell operations; there is no public administrator API.

## Exercise media

Exercise data by [RepDB](https://repdb.co). The catalog includes dumbbells, machines, barbell lifts and bodyweight movements with locally bundled 512x512 free-tier WebP illustrations and matching source muscle labels/instructions. Attribution and license: `assets/exercise-media/ATTRIBUTION.md` and `REPDB-LICENSE.md`. Premium assets are not used. `client/media.js` records the mapping. Images are movement illustrations, not videos.

## Validation and launch gate

```sh
npm test
npm run test:community
npm run test:release
npm run test:judge-fixes
npm run test:browser
```

Browser checks use Playwright. Set `BROWSER_PATH` to your Chromium executable if needed. Automated checks cover API isolation, conflicts/retries, gym rankings, profile photos, moderation, origin protections, snapshots/restoration, real posts, guided workout logging, offline reload, barbell routines, custom exercises, guarded set corrections/deletion, immutable public snapshots and automatic recovery/sync.

**Deployment still requires owner action:** supply the real tunnel token, run Docker on the target host, verify the public hostname/HTTPS/cookies, install on real Android and iPhone devices, complete an offline workout, reconnect and confirm restore on a second device. Docker is unavailable in this development environment; image startup and the actual tunnel have not been verified here. Google sign-in is removed from this release. See `RELEASE-REVIEW.md` for the independent judge review. Its required code fixes were implemented and locally tested, but the final independent recheck was interrupted by the account usage limit; no final judge approval is claimed.
