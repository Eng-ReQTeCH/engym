param([switch]$SkipWebBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$javaRoot = (Get-ChildItem -LiteralPath (Join-Path $projectRoot '.build-tools/java') -Directory | Select-Object -First 1).FullName
$env:JAVA_HOME = $javaRoot
$env:ANDROID_HOME = Join-Path $projectRoot '.build-tools/android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.build-tools/gradle-cache'
$env:PATH = "$javaRoot\bin;$env:PATH"
$signingRoot = Join-Path $projectRoot '.android-signing'
New-Item -ItemType Directory -Force $signingRoot | Out-Null
$passwordFile = Join-Path $signingRoot 'password'
$env:ENGYM_KEYSTORE_PATH = Join-Path $signingRoot 'engym-release.jks'
if (!(Test-Path -LiteralPath $env:ENGYM_KEYSTORE_PATH)) {
 if (Test-Path -LiteralPath $passwordFile) { throw 'A password exists without its signing key. Restore the original key before building.' }
 $password = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
 [IO.File]::WriteAllText($passwordFile, $password)
 $env:ENGYM_SIGNING_PASSWORD = $password
 & "$javaRoot/bin/keytool.exe" -genkeypair -noprompt -keystore $env:ENGYM_KEYSTORE_PATH -storepass:env ENGYM_SIGNING_PASSWORD -keypass:env ENGYM_SIGNING_PASSWORD -alias engym -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Engym'
 if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed' }
}
$env:ENGYM_SIGNING_PASSWORD = [IO.File]::ReadAllText($passwordFile).Trim()
Push-Location $projectRoot
try {
 if (!$SkipWebBuild) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Web build failed' } }
 New-Item -ItemType Directory -Force android/app/src/main/assets | Out-Null
 Copy-Item -Path dist/* -Destination android/app/src/main/assets -Recurse -Force
 & (Join-Path $projectRoot '.build-tools/gradle-8.10.2/bin/gradle.bat') --no-daemon --console=plain -p android :app:assembleRelease
 if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
 & (Join-Path $env:ANDROID_HOME 'build-tools/35.0.0/apksigner.bat') verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk
 if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
 New-Item -ItemType Directory -Force release | Out-Null
 Copy-Item -LiteralPath android/app/build/outputs/apk/release/app-release.apk -Destination release/engym-1.0.0.apk -Force
 $hash = (Get-FileHash release/engym-1.0.0.apk -Algorithm SHA256).Hash.ToLower()
 [IO.File]::WriteAllText((Join-Path $projectRoot 'release/engym-1.0.0.apk.sha256'), "$hash  engym-1.0.0.apk`n")
 Write-Output 'Signed and verified: release/engym-1.0.0.apk'
} finally {
 Remove-Item Env:ENGYM_SIGNING_PASSWORD -ErrorAction SilentlyContinue
 Pop-Location
}
