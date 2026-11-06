# Android APK

The release build compiled successfully. Signed output: ../release/engym-1.0.0.apk. Android 10+. Signature, alignment, package metadata, release lint and bundled offline assets verified. Physical-device behavior remains untested.

See ../DEPLOYMENT.md. Local rebuild: ../scripts/build-apk.ps1 using the portable toolchain under ../.build-tools. Docker rebuild: ../compose.android.yaml. Preserve ../.android-signing privately and import its key/password into Docker's signing volume before generating updates for this APK.

References: https://developer.android.com/develop/ui/views/layout/webapps/load-local-content and https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader.
