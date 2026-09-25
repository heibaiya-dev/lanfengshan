$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$androidRoot = Join-Path $projectRoot "src-tauri\gen\android"
$keystoreDir = Join-Path $projectRoot "src-tauri\keystore"
$keystorePath = Join-Path $keystoreDir "lanfengshan-release.jks"
$propertiesPath = Join-Path $androidRoot "keystore.properties"

New-Item -ItemType Directory -Path $keystoreDir -Force | Out-Null
if (Test-Path -LiteralPath $propertiesPath -PathType Leaf) {
    if (-not (Test-Path -LiteralPath $keystorePath -PathType Leaf)) {
        throw "keystore.properties exists but the release keystore is missing at $keystorePath. Restore the key before building updates."
    }
    exit 0
}
if (Test-Path -LiteralPath $keystorePath -PathType Leaf) {
    throw "The release keystore exists but keystore.properties is missing. Restore the ignored properties file before building updates."
}

$keytool = (Get-Command keytool -ErrorAction Stop).Source
$alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
$password = -join (1..32 | ForEach-Object { $alphabet[(Get-Random -Minimum 0 -Maximum $alphabet.Length)] })
$alias = "lanfengshan"

& $keytool -genkeypair `
    -keystore $keystorePath `
    -storetype JKS `
    -alias $alias `
    -keyalg RSA `
    -keysize 4096 `
    -validity 10000 `
    -storepass $password `
    -keypass $password `
    -dname "CN=Lanfengshan, OU=Mobile, O=Heibai, L=Unknown, ST=Unknown, C=CN" `
    -noprompt | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "keytool failed to create the release keystore."
}

$properties = @"
password=$password
keyAlias=$alias
storeFile=../../../keystore/lanfengshan-release.jks
"@
[IO.File]::WriteAllText($propertiesPath, $properties.Trim() + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
