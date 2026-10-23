// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OscarCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    products: [.library(name: "OscarCore", targets: ["OscarCore"])],
    targets: [
        .target(name: "OscarCore", path: "Core", linkerSettings: [.linkedFramework("JavaScriptCore")]),
        .testTarget(name: "OscarCoreTests", dependencies: ["OscarCore"], path: "Tests")
    ]
)
