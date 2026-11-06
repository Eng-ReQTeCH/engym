# Engym server and Android setup

## What is provided

This source package contains the working web app/server, Cloudflare Tunnel Compose stack and an Android APK build project. **A signed APK is available at `release/engym-1.0.0.apk` (Android 10+, 14.8 MB).** A portable Java/Android toolchain was installed locally; the release build, Android release lint, signature, alignment, manifest and bundled-asset checks passed. A physical-device run and Docker image run have not been performed. The web build and browser/API tests passed before packaging; the judge's final recheck was interrupted by the account usage limit.

Google sign-in buttons have been removed from the generated signup/login pages and frontend code; the release Compose file supplies no Google credentials. Accounts use email/handle plus password.

## 1. Copy this folder to the other machine

Install Docker Engine and Docker Compose 2.24.4 or newer on your Linux server. Unzip this package to a persistent folder such as `/opt/engym`, then open a terminal there. You do not need Node or npm on the server; the image builds the web app.

```sh
cd /opt/engym
cp .env.example .env
mkdir -p secrets
chmod 700 secrets
```

Keep `.env` set to:

```dotenv
PUBLIC_URL=https://engym.minaghali.xyz
TRUST_PROXY=false
```

The tunnel override enables proxy trust internally. It removes the app's host port bindings entirely.

## 2. Create your Cloudflare Tunnel

In Cloudflare, create a remotely managed tunnel. Copy **only the tunnel token**, not the entire install command, into `secrets/cloudflare-tunnel-token.txt`. Use an editor so the token does not enter shell history:

```sh
nano secrets/cloudflare-tunnel-token.txt
chmod 600 secrets/cloudflare-tunnel-token.txt
```

Create a published application route:

| Setting | Value |
|---|---|
| Hostname | `engym.minaghali.xyz` |
| Type | HTTP |
| Service URL | `engym:8080` |
| Full origin | `http://engym:8080` |

The origin is the Docker service name. Do not use localhost in the Cloudflared container. Allow Cloudflare to add the hostname's DNS record. Enable Always Use HTTPS. Avoid an interactive Cloudflare Access login in front of this public app and do not apply Cache Everything to `/api/*`, HTML or `/sw.js`. No inbound router ports are needed.

## 3. Start the server

```sh
docker compose -f compose.yaml -f compose.tunnel.yaml up -d --build
docker compose -f compose.yaml -f compose.tunnel.yaml ps
docker compose -f compose.yaml -f compose.tunnel.yaml logs --tail=100 engym cloudflared backups
```

The web app/API, database snapshots and tunnel should all stay running. Visit `https://engym.minaghali.xyz/api/health`; expect `{"ok":true,"version":1}`. Then open the main hostname, create an account and make a test routine/workout. Install the web app from Chrome or Safari if you want it before building Android.

The `engym-data` volume holds accounts, workouts and automatic verified database snapshots. Snapshots run at startup and every six hours, retaining 28. Never run `docker compose down -v` on your real installation: that deletes named volumes. Keep a private encrypted off-machine backup of the volume; same-host snapshots cannot survive losing the host. Restore and moderation commands are in README.md.

## 4. Build the Android APK on the Docker machine

This builds a signed APK using Java, Android SDK and Gradle inside Docker. The image downloads Google's Android tools and accepts SDK licenses while building; review the Android SDK terms before running it. It requires internet access and several GB of free disk space.

```sh
mkdir -p release
docker compose -f compose.android.yaml build
docker compose -f compose.android.yaml run --rm android-build
```

Output:

```text
release/engym-1.0.0.apk
release/engym-1.0.0.apk.sha256
```

The build command verifies the APK signature and emits a SHA-256 checksum. Copy the APK to your phone and open it; allow installation from the app you used to open it. Supports Android 10 and newer. This is a sideloaded APK, not a Play Store publication.

The Android app packages the full app shell and exercise artwork inside the APK and serves it under Engym's HTTPS origin with Android's WebViewAssetLoader. `/api/` goes to your actual HTTPS server. This is intended to allow first-launch local training before the server is online. Native source compiled successfully; runtime/device behavior still requires a real Android device check. Profile/workout photo input supports file selection and delegated camera capture; there is no broad storage permission or JavaScript-to-native interface.

**Keep the signing key.** The APK provided here was signed using `.android-signing/engym-release.jks`, with its password in `.android-signing/password`. Both files are private and deliberately excluded from the deployment ZIP. Preserve them for updates. For future Docker builds, securely copy that directory to your server and import the same two files into the `engym-signing` volume; otherwise Docker creates a different key and cannot update this installed APK. A fresh Docker-only first build creates its private key/password in that volume. Keep this volume and back it up privately. Reusing the same application ID and key is necessary for updates to preserve installed app data. Never publish the signing volume or its password. Do not delete it between builds. To release an update, increase `versionCode`/`versionName` in `android/app/build.gradle`, adjust the output filename in `scripts/build-apk.sh`, rebuild, then install over the existing app without uninstalling it.

Native APK updates contain web UI changes; deploy the web server separately with the command in step 3. APK updates are not automatically delivered from an app store in this setup.

## 5. Required real-device checks before handing it to users

1. Build and install the signed APK. Verify its package, signature and application icon.
2. Before connecting to the server, turn airplane mode on and create/complete a workout. Restart the app and verify it remains.
3. Connect, sign up/sign in and wait for BACKED UP. Sign in on a second device and verify the restored routine, sets, photo and notes.
4. Test kg/lbs switching, treadmill speed, photo capture/file selection, keyboard and safe areas on a real Android phone.
5. Join the same gym from two accounts, publish deliberately and check friends/gym rankings, correction/republishing and deletion.
6. Restart the server stack, inspect snapshot health and complete a restore drill on a separate volume.

The judge initially held public release for missing set correction/deletion and barbell lifts. Those fixes now pass `tests/judge-fixes-browser.mjs`, including offline correction and second-browser restore, but the independent recheck could not finish due to the account usage limit. The original judge report is preserved in RELEASE-REVIEW.md. Do not treat it as final production approval.

## Reuse this APK's signing key on the server

After securely copying the original `.android-signing` directory to the server folder and building the Android image, import it into a fresh signing volume before the first APK build:

```sh
docker compose -f compose.android.yaml run --rm --entrypoint sh -v "$PWD/.android-signing:/import:ro" android-build -c 'test ! -e /signing/engym-release.jks && cp /import/engym-release.jks /signing/engym-release.jks && cp /import/password /signing/password && chmod 600 /signing/engym-release.jks /signing/password'
```

If a different key already exists, this command refuses to overwrite it. Preserve that volume and deliberately select the correct original signing identity. Never publish either private file or include it in an APK/source download.
