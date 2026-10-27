import org.gradle.api.tasks.Sync

plugins { id("com.android.application") }

android {
    namespace = "com.jingjing.chesssprout"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.jingjing.chesssprout"
        minSdk = 26
        targetSdk = 36
        versionCode = 15
        versionName = "1.3.8"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging { jniLibs.useLegacyPackaging = true }
    testOptions { unitTests.all { it.jvmArgs("-Dfile.encoding=UTF-8") } }
    sourceSets["main"].java.srcDir("../../vendor/chesslib/src/main/java")
}

val projectRoot = rootProject.projectDir.parentFile
val webAssets = layout.buildDirectory.dir("generated/webAssets")
val engineLibraries = layout.buildDirectory.dir("generated/jniLibs")
val iconResources = layout.buildDirectory.dir("generated/iconRes")
val syncIconResources by tasks.registering(Sync::class) {
    from(projectRoot.resolve("review/assets")) {include("oscar-panic.png");rename("oscar-panic.png","oscar_panic.png");into("drawable-nodpi")}
    into(iconResources)
}
android.sourceSets["main"].res.directories.add(iconResources.get().asFile.absolutePath)
tasks.matching {it.name!="syncIconResources" && (it.name.contains("Resources") || it.name.contains("lint",ignoreCase=true))}.configureEach {dependsOn(syncIconResources)}
val syncReviewAssets by tasks.registering(Sync::class) {
    from(projectRoot) {
        include("review/**", "src/controlMap.js", "vendor/chess.min.js", "vendor/chess.js-LICENSE.txt", "vendor/pieces/**")
    }
    from(projectRoot.resolve("vendor/stockfish")) {
        include("Copying.txt", "README-upstream.md")
        into("licenses/stockfish")
    }
    from(projectRoot.resolve("vendor/chesslib/LICENSE")) { into("licenses/chesslib") }
    from(projectRoot.resolve("vendor/chess-sprout-sources.json")) { into("licenses") }
    from(projectRoot.resolve("vendor/stockfish/networks")) { into("networks") }
    into(webAssets)
}
val syncStockfish by tasks.registering(Sync::class) {
    from(projectRoot.resolve("vendor/stockfish")) { include("arm64-v8a/*.so", "x86_64/*.so") }
    into(engineLibraries)
}
android.sourceSets["main"].assets.directories.add(webAssets.get().asFile.absolutePath)
android.sourceSets["main"].jniLibs.directories.add(engineLibraries.get().asFile.absolutePath)
val visionFixtures=layout.buildDirectory.dir("generated/visionFixtures")
val syncVisionFixtures by tasks.registering(Sync::class) {
    from(layout.buildDirectory.dir("reports")) {include("duolingo-auto-initial.png", "duolingo-game-??.png", "duolingo-reference.json", "duolingo-promotion-start.png", "duolingo-promotion-live-??.png","v121-practice-rewind.mp4")}
    into(visionFixtures)
}
android.sourceSets["androidTest"].assets.directories.add(visionFixtures.get().asFile.absolutePath)
tasks.matching {it.name=="mergeDebugAndroidTestAssets" || it.name.contains("AndroidTest") && it.name.contains("lint",ignoreCase=true)}.configureEach {dependsOn(syncVisionFixtures)}
tasks.named("preBuild").configure { dependsOn(syncReviewAssets, syncStockfish, syncIconResources) }

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.activity:activity:1.9.3")
    implementation("org.apache.commons:commons-lang3:3.18.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
