# Project guide

Android recorder module :recorder; shared static UI in review/; vendored rules, engines and licenses in vendor/. Build outputs stay in android/recorder/build/ and must not be committed. docs/images/ contains presentation screenshots; docs/examples/ contains the verified public demonstration PGN.

Run npm test and npm run test:ui for JavaScript. In android/, run gradlew :recorder:testDebugUnitTest :recorder:lintDebug :recorder:assembleDebug. Android instrumentation needs the Release vision fixture archive extracted into android/recorder/build/reports/; fixtures must never enter the main APK. Keep package identity and persistent storage compatible. Do not publish account information, secrets, emulator data, signing keys or full user screen recordings.
