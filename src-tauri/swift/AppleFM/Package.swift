// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "AppleFM",
  platforms: [.macOS(.v12)],
  products: [
    .library(name: "AppleFM", type: .static, targets: ["AppleFM"])
  ],
  targets: [
    .target(
      name: "AppleFM",
      //weak linked by the rust build
      swiftSettings: [.unsafeFlags(["-Xfrontend", "-disable-autolink-framework", "-Xfrontend", "FoundationModels"])]
    )
  ]
)
