const { withXcodeProject, withDangerousMod, withEntitlementsPlist } = require('expo/config-plugins')
const path = require('node:path')
const fs = require('node:fs')

/**
 * iOS Share Extension for Universal Capture.
 *
 * The extension writes what was shared into the shared App Group container and
 * then opens the host app with a `dijitalasistan://capture` URL. The extension
 * deliberately does no analysis of its own: extensions have a hard memory
 * budget and get killed for exceeding it, and the analysis needs the signed-in
 * session that lives in the host app's keychain access group anyway.
 */

const TARGET_NAME = 'DijitalAsistanShare'

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>tr</string>
  <key>CFBundleDisplayName</key>
  <string>Dijital Asistan</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>XPC!</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>ShareViewController</string>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>NSExtensionActivationRule</key>
      <dict>
        <key>NSExtensionActivationSupportsText</key>
        <true/>
        <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
        <integer>1</integer>
        <key>NSExtensionActivationSupportsImageWithMaxCount</key>
        <integer>10</integer>
        <key>NSExtensionActivationSupportsFileWithMaxCount</key>
        <integer>5</integer>
      </dict>
    </dict>
  </dict>
</dict>
</plist>
`

const ENTITLEMENTS = (appGroup) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${appGroup}</string>
  </array>
</dict>
</plist>
`

const SHARE_VIEW_CONTROLLER = (appGroup, scheme) => `import UIKit
import Social
import UniformTypeIdentifiers

/// Receives shared content, persists it to the App Group container, and hands
/// off to the host app.
///
/// Everything is written under a single pending-capture payload rather than
/// posted to the network: the extension has no session, and a capture that
/// arrives without one would be unattributable.
class ShareViewController: UIViewController {

    private let appGroup = "${appGroup}"
    private let scheme = "${scheme}"

    override func viewDidLoad() {
        super.viewDidLoad()
        handleSharedItems()
    }

    private func handleSharedItems() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            complete(); return
        }

        var text: String?
        var url: String?
        var fileNames: [String] = []
        let group = DispatchGroup()

        for item in extensionItems {
            for provider in item.attachments ?? [] {

                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { value, _ in
                        if let shared = value as? URL { url = shared.absoluteString }
                        group.leave()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { value, _ in
                        if let shared = value as? String { text = shared }
                        group.leave()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { value, _ in
                        if let name = self.copyToContainer(value: value, fallbackExtension: "jpg") {
                            fileNames.append(name)
                        }
                        group.leave()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.pdf.identifier, options: nil) { value, _ in
                        if let name = self.copyToContainer(value: value, fallbackExtension: "pdf") {
                            fileNames.append(name)
                        }
                        group.leave()
                    }
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            self?.persist(text: text, url: url, fileNames: fileNames)
            self?.openHostApp(hasText: text != nil, hasUrl: url != nil, fileCount: fileNames.count)
            self?.complete()
        }
    }

    /// Copies a shared file into the App Group container and returns its name.
    private func copyToContainer(value: NSSecureCoding?, fallbackExtension: String) -> String? {
        guard let containerURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("captures", isDirectory: true) else { return nil }

        try? FileManager.default.createDirectory(at: containerURL, withIntermediateDirectories: true)

        let name = "\\(UUID().uuidString).\\(fallbackExtension)"
        let destination = containerURL.appendingPathComponent(name)

        if let source = value as? URL {
            try? FileManager.default.copyItem(at: source, to: destination)
            return name
        }
        if let data = value as? Data {
            try? data.write(to: destination)
            return name
        }
        if let image = value as? UIImage, let data = image.jpegData(compressionQuality: 0.85) {
            try? data.write(to: destination)
            return name
        }
        return nil
    }

    private func persist(text: String?, url: String?, fileNames: [String]) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        var payload: [String: Any] = ["receivedAt": Date().timeIntervalSince1970]
        if let text { payload["text"] = text }
        if let url { payload["url"] = url }
        if !fileNames.isEmpty { payload["files"] = fileNames }

        // A queue rather than a single slot: sharing twice before opening the
        // app must not silently drop the first capture.
        var queue = defaults.array(forKey: "pendingCaptures") as? [[String: Any]] ?? []
        queue.append(payload)
        defaults.set(Array(queue.suffix(20)), forKey: "pendingCaptures")
    }

    private func openHostApp(hasText: Bool, hasUrl: Bool, fileCount: Int) {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "capture"
        components.queryItems = [URLQueryItem(name: "source", value: "share")]
        guard let target = components.url else { return }

        // Opening the containing app from an extension has no public API, so
        // the responder chain is walked to reach UIApplication.
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(target, options: [:], completionHandler: nil)
                return
            }
            responder = current.next
        }
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
`

const withIosShareExtension = (config) => {
  const appGroup =
    process.env.APP_IOS_APP_GROUP?.trim() ||
    config.ios?.entitlements?.['com.apple.security.application-groups']?.[0] ||
    'group.com.dijitalasistan.app'
  const scheme = typeof config.scheme === 'string' ? config.scheme : 'dijitalasistan'

  // Make sure the host app declares the same group, or the container is unreachable.
  config = withEntitlementsPlist(config, (cfg) => {
    const key = 'com.apple.security.application-groups'
    const existing = cfg.modResults[key]
    const groups = Array.isArray(existing) ? existing : []
    if (!groups.includes(appGroup)) groups.push(appGroup)
    cfg.modResults[key] = groups
    return cfg
  })

  // Write the extension sources next to the Xcode project.
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, TARGET_NAME)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'Info.plist'), INFO_PLIST, 'utf8')
      fs.writeFileSync(
        path.join(dir, `${TARGET_NAME}.entitlements`),
        ENTITLEMENTS(appGroup),
        'utf8',
      )
      fs.writeFileSync(
        path.join(dir, 'ShareViewController.swift'),
        SHARE_VIEW_CONTROLLER(appGroup, scheme),
        'utf8',
      )
      return cfg
    },
  ])

  // Register the target in the Xcode project.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const bundleId = `${cfg.ios?.bundleIdentifier ?? 'com.dijitalasistan.app'}.share`

    if (project.pbxTargetByName(TARGET_NAME)) return cfg

    const group = project.addPbxGroup(
      ['Info.plist', `${TARGET_NAME}.entitlements`, 'ShareViewController.swift'],
      TARGET_NAME,
      TARGET_NAME,
    )

    const groups = project.hash.project.objects.PBXGroup
    Object.keys(groups).forEach((key) => {
      if (groups[key].name === undefined && groups[key].path === undefined) {
        project.addToPbxGroup(group.uuid, key)
      }
    })

    const target = project.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, bundleId)

    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)
    project.addSourceFile('ShareViewController.swift', { target: target.uuid }, group.uuid)

    const configurations = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key].buildSettings
      if (!buildSettings || buildSettings.PRODUCT_NAME !== `"${TARGET_NAME}"`) continue
      buildSettings.CODE_SIGN_ENTITLEMENTS = `"${TARGET_NAME}/${TARGET_NAME}.entitlements"`
      buildSettings.INFOPLIST_FILE = `"${TARGET_NAME}/Info.plist"`
      // Matches the app target's floor (Expo SDK 57 requires 16.4).
      buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.4'
      buildSettings.SWIFT_VERSION = '5.0'
      buildSettings.TARGETED_DEVICE_FAMILY = '"1"'
      buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${bundleId}"`
    }

    return cfg
  })

  return config
}

module.exports = withIosShareExtension
