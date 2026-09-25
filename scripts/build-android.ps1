param(
    [ValidateSet("aarch64", "armv7")]
    [string]$Architecture = "aarch64"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$packageManifest = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
$appVersion = [string]$packageManifest.version
if ([string]::IsNullOrWhiteSpace($appVersion)) {
    throw "package.json does not define an application version."
}
$targetDir = Join-Path $projectRoot "src-tauri\target"
$tempDir = Join-Path $targetDir "tmp"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
& (Join-Path $PSScriptRoot "ensure-release-keystore.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Unable to prepare the release signing keystore."
}

if (-not $env:ANDROID_HOME) {
    throw "ANDROID_HOME must point to an installed Android SDK."
}

$ndkHome = if ($env:NDK_HOME) { $env:NDK_HOME } elseif ($env:ANDROID_NDK_HOME) { $env:ANDROID_NDK_HOME } else { Join-Path $env:ANDROID_HOME "ndk\android-ndk-r27" }
$clangBin = Join-Path $ndkHome "toolchains\llvm\prebuilt\windows-x86_64\bin"
$architectureConfig = @{
    aarch64 = @{
        clangTarget = "aarch64-linux-android"
        linkerVariable = "CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER"
        abi = "arm64-v8a"
    }
    armv7 = @{
        clangTarget = "armv7a-linux-androideabi"
        linkerVariable = "CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER"
        abi = "armeabi-v7a"
    }
}[$Architecture]
$clang = Join-Path $clangBin "clang.exe"
if (-not (Test-Path -LiteralPath $clang -PathType Leaf)) {
    throw "Android NDK linker not found at $clang. Set NDK_HOME to the installed NDK."
}

$sysroot = (& rustc --print sysroot).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sysroot -PathType Container)) {
    throw "Rust toolchain sysroot could not be found."
}

# The Windows Android linker drops apostrophes from path arguments. A project-local
# junction and temp directory keep Rust's sysroot and linker response files readable.
$sysrootAlias = Join-Path $targetDir "rust-sysroot"
if (-not (Test-Path -LiteralPath $sysrootAlias)) {
    New-Item -ItemType Junction -Path $sysrootAlias -Target $sysroot | Out-Null
}

$env:TEMP = $tempDir
$env:TMP = $tempDir
$env:CARGO_ENCODED_RUSTFLAGS = @("--sysroot", $sysrootAlias, "-Clink-arg=--target=$($architectureConfig.clangTarget)24") -join [char]31
Set-Item -Path "Env:$($architectureConfig.linkerVariable)" -Value $clang

Push-Location $projectRoot
try {
    & npx tauri android build --target $Architecture --apk --ci @args
    $buildExitCode = $LASTEXITCODE
    if ($buildExitCode -ne 0) {
        exit $buildExitCode
    }

    $apkRoot = Join-Path $projectRoot "src-tauri\gen\android\app\build\outputs\apk"
    $releaseApk = Get-ChildItem -LiteralPath $apkRoot -Recurse -Filter "*.apk" |
        Where-Object { $_.FullName -match "\\release\\" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $releaseApk) {
        throw "Tauri completed without producing an Android release APK under $apkRoot."
    }

    $releaseDir = Join-Path $projectRoot "releases"
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    $deliverable = Join-Path $releaseDir "zaoxueji-$appVersion-$($architectureConfig.abi)-release.apk"
    Copy-Item -LiteralPath $releaseApk.FullName -Destination $deliverable -Force

    $buildTools = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME "build-tools") -Directory |
        Sort-Object Name -Descending | Select-Object -First 1
    $apksigner = Join-Path $buildTools.FullName "apksigner.bat"
    $aapt = Join-Path $buildTools.FullName "aapt.exe"
    & $apksigner verify --verbose $deliverable
    if ($LASTEXITCODE -ne 0) {
        throw "apksigner rejected the release APK."
    }
    $badging = (& $aapt dump badging $deliverable) -join [Environment]::NewLine
    if ($badging -notmatch "package: name='com\.heibai\.hyw\.zaoxueji'") {
        throw "The release APK package identifier is not com.heibai.hyw.zaoxueji."
    }
    if ($badging -notmatch "native-code:.*$($architectureConfig.abi)") {
        throw "The release APK does not contain the $($architectureConfig.abi) native library."
    }
    if ($badging -match "application-debuggable") {
        throw "The release APK is marked debuggable."
    }
    $manifestTree = (& $aapt dump xmltree $deliverable AndroidManifest.xml) -join [Environment]::NewLine
    foreach ($component in @("LanfengWidgetProvider", "XuelangWidgetProvider", "DuetWidgetProvider", "FanWidgetAudioService", "FanWidgetAudioActivity")) {
        if ($manifestTree -notmatch [regex]::Escape($component)) {
            throw "The release APK is missing the Android widget component $component."
        }
    }
    $entries = & $aapt list $deliverable
    foreach ($asset in @("assets/widget/catalog.json", "assets/widget/audio/xuelang-start.mp3", "assets/widget/audio/xuelang-stop.mp3")) {
        if ($entries -notcontains $asset) {
            throw "The release APK is missing the Android widget asset $asset."
        }
    }
    Write-Output "Release APK: $deliverable"
} finally {
    Pop-Location
}
