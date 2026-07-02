// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "OpenTeleprompter",
    defaultLocalization: "zh-Hans",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "TeleprompterCore", targets: ["TeleprompterCore"]),
        .executable(name: "TeleprompterApp", targets: ["TeleprompterApp"]),
    ],
    targets: [
        .target(
            name: "TeleprompterCore",
            path: "Sources/TeleprompterCore"
        ),
        .executableTarget(
            name: "TeleprompterApp",
            dependencies: ["TeleprompterCore"],
            path: "Sources/TeleprompterApp",
            exclude: ["Resources/.gitkeep"],
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "App-Info.plist",
                ]),
            ]
        ),
        .testTarget(
            name: "TeleprompterCoreTests",
            dependencies: ["TeleprompterCore"],
            path: "Tests/TeleprompterCoreTests"
        ),
    ]
)
