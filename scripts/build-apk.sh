#!/bin/sh
set -eu
umask 077
mkdir -p /signing /output
if [ ! -f /signing/engym-release.jks ]; then
  if [ -f /signing/password ]; then
    echo "Signing password exists without its keystore. Restore the original keystore before continuing." >&2
    exit 1
  fi
  head -c 48 /dev/urandom | base64 | tr -d '\n' > /signing/password
  export ENGYM_SIGNING_PASSWORD="$(cat /signing/password)"
  keytool -genkeypair -noprompt -keystore /signing/engym-release.jks -storepass:env ENGYM_SIGNING_PASSWORD -keypass:env ENGYM_SIGNING_PASSWORD -alias engym -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Engym"
fi
export ENGYM_SIGNING_PASSWORD="$(cat /signing/password)"
cd /workspace/android
gradle --no-daemon :app:assembleRelease
/opt/android-sdk/build-tools/35.0.0/apksigner verify --verbose app/build/outputs/apk/release/app-release.apk
cp app/build/outputs/apk/release/app-release.apk /output/engym-1.0.0.apk
chmod 644 /output/engym-1.0.0.apk
cd /output
sha256sum engym-1.0.0.apk > engym-1.0.0.apk.sha256
chmod 644 /output/engym-1.0.0.apk.sha256
echo "Signed APK: release/engym-1.0.0.apk. Back up the engym-signing Docker volume privately; keep it for every update."
