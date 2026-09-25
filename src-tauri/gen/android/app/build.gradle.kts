import java.util.Properties
import groovy.json.JsonOutput

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val releaseSigningProperties = Properties().apply {
    val propFile = rootProject.file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.heibai.hyw.lanfengshan"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.heibai.hyw.lanfengshan"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            val storeFilePath = releaseSigningProperties.getProperty("storeFile")
            val storePasswordValue = releaseSigningProperties.getProperty("password")
            val keyAliasValue = releaseSigningProperties.getProperty("keyAlias")
            require(!storeFilePath.isNullOrBlank() && !storePasswordValue.isNullOrBlank() && !keyAliasValue.isNullOrBlank()) {
                "Missing src-tauri/gen/android/keystore.properties for the release signing configuration."
            }
            storeFile = file(storeFilePath)
            storePassword = storePasswordValue
            keyAlias = keyAliasValue
            keyPassword = storePasswordValue
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isDebuggable = false
            isJniDebuggable = false
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
    androidResources { noCompress += listOf("mp3", "wav") }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/widgetAssets"))
    testOptions { unitTests.isIncludeAndroidResources = true }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")

// Native widgets need assets without the WebView. Keep their catalog derived from
// the shared catalog and compress their private audio copies to limit APK growth.
val generateWidgetAssets by tasks.registering {
    val publicDir = rootProject.file("../../../public")
    val catalogFile = rootProject.file("../../../src/mediaCatalog.ts")
    val outputDir = layout.buildDirectory.dir("generated/widgetAssets/widget")
    inputs.files(fileTree(publicDir) { include("audio/*.mp3", "audio/*.wav", "assets/*.png") })
    inputs.file(catalogFile)
    outputs.dir(outputDir)
    doLast {
        val destination = outputDir.get().asFile
        val audioDir = destination.resolve("audio").apply { mkdirs() }
        val ffmpeg = System.getenv("FFMPEG") ?: "ffmpeg"
        val canEncode = try {
            ProcessBuilder(ffmpeg, "-version").redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).start().waitFor() == 0
        } catch (_: Exception) { false }
        if (!canEncode) logger.warn("ffmpeg unavailable: native widget audio uses original files; APK size will increase.")
        val filenames = mutableMapOf<String, String>()
        publicDir.resolve("audio").listFiles()!!.filter { it.extension in listOf("mp3", "wav") }.forEach { source ->
            val name = if (canEncode) source.nameWithoutExtension + ".mp3" else source.name
            val target = audioDir.resolve(name)
            if (!target.exists() || target.lastModified() < source.lastModified()) {
                if (canEncode) {
                    val process = ProcessBuilder(ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", source.absolutePath,
                        "-vn", "-map_metadata", "-1", "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", target.absolutePath)
                        .inheritIO().start()
                    check(process.waitFor() == 0) { "Unable to encode widget audio: ${source.name}" }
                } else source.copyTo(target, overwrite = true)
            }
            filenames[source.name] = name
        }
        val pattern = Regex("""\{ id: "([^"]+)", label: "([^"]+)", file: "([^"]+)", note: "[^"]*", brand: "([^"]+)" \}""")
        val catalog = pattern.findAll(catalogFile.readText()).map { match ->
            val (id, label, file, brand) = match.destructured
            mapOf("id" to id, "label" to label, "file" to checkNotNull(filenames[file]), "brand" to brand)
        }.toList()
        check(catalog.isNotEmpty() && catalog.map { it["brand"] }.containsAll(listOf("lanfeng", "xuelang", "chorus"))) {
            "Widget catalog must include all three fan brands."
        }
        destination.resolve("catalog.json").writeText(JsonOutput.toJson(catalog))
        val images = destination.resolve("assets").apply { mkdirs() }
        listOf("blade-1.png", "hub-new.png", "xuelang-blade-1.png", "xuelang-hub.png").forEach {
            publicDir.resolve("assets/$it").copyTo(images.resolve(it), overwrite = true)
        }
    }
}
tasks.named("preBuild").configure { dependsOn(generateWidgetAssets) }
