const { withXcodeProject, withDangerousMod, withEntitlementsPlist } = require('expo/config-plugins')
const path = require('node:path')
const fs = require('node:fs')

/**
 * WidgetKit extension.
 *
 * The widget reads a snapshot the app writes into the App Group container
 * after every briefing refresh, so it renders instantly and works offline. It
 * never talks to the network: a widget has no session and a widget-triggered
 * fetch would be an unauthenticated request for a specific user's day.
 */

const TARGET_NAME = 'DijitalAsistanWidget'
const SOURCE_FILE = 'DijitalAsistanWidget.swift'

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
    <string>com.apple.widgetkit-extension</string>
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

const WIDGET_SWIFT = (appGroup, scheme) => `import WidgetKit
import SwiftUI

private let appGroup = "${appGroup}"
private let urlScheme = "${scheme}"

/// One item in the widget snapshot.
struct WidgetItem: Codable, Identifiable {
    let id: String
    let title: String
    let subtitle: String?
    /// "critical" | "high" | "normal"
    let importance: String
    /// Deep-link path, e.g. "thread/abc".
    let path: String
}

/// The snapshot the host app writes after each refresh.
struct WidgetSnapshot: Codable {
    let greeting: String
    let headline: String
    let priorityCount: Int
    let items: [WidgetItem]
    let nextEventTitle: String?
    let nextEventTime: String?
    let followUpCount: Int
    let updatedAt: Double
    /// Localised "nothing to show" line, so the widget needs no bundled strings.
    let emptyLabel: String
}

struct DaEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

private func loadSnapshot() -> WidgetSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let raw = defaults.string(forKey: "widgetSnapshot"),
          let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> DaEntry {
        DaEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (DaEntry) -> Void) {
        completion(DaEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DaEntry>) -> Void) {
        // The app writes a fresh snapshot on every refresh and reloads timelines
        // explicitly; the 30-minute cadence is only a floor so a widget on a
        // device that has not opened the app still ages visibly.
        let entry = DaEntry(date: Date(), snapshot: loadSnapshot())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private func tint(for importance: String) -> Color {
    switch importance {
    case "critical": return Color(red: 0.88, green: 0.33, blue: 0.25)
    case "high": return Color(red: 0.88, green: 0.60, blue: 0.11)
    default: return Color(red: 0.36, green: 0.36, blue: 0.89)
    }
}

private func link(_ path: String) -> URL {
    URL(string: "\\(urlScheme)://\\(path)") ?? URL(string: "\\(urlScheme)://today")!
}

struct ItemRow: View {
    let item: WidgetItem
    var body: some View {
        Link(destination: link(item.path)) {
            HStack(alignment: .top, spacing: 6) {
                Circle().fill(tint(for: item.importance)).frame(width: 6, height: 6).padding(.top, 5)
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                    if let subtitle = item.subtitle {
                        Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct EmptyView_: View {
    let label: String
    var body: some View {
        Text(label).font(.system(size: 13)).foregroundStyle(.secondary)
    }
}

struct SmallWidgetView: View {
    let entry: DaEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Dijital Asistan").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
            if let snapshot = entry.snapshot, let first = snapshot.items.first {
                Text(first.title).font(.system(size: 14, weight: .semibold)).lineLimit(3)
                Spacer(minLength: 0)
                if snapshot.priorityCount > 1 {
                    Text("+\\(snapshot.priorityCount - 1)").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            } else {
                Spacer()
                EmptyView_(label: entry.snapshot?.emptyLabel ?? "—")
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(link(entry.snapshot?.items.first?.path ?? "today"))
    }
}

struct MediumWidgetView: View {
    let entry: DaEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(entry.snapshot?.headline ?? "Dijital Asistan")
                .font(.system(size: 13, weight: .semibold)).lineLimit(1)
            if let snapshot = entry.snapshot, !snapshot.items.isEmpty {
                ForEach(snapshot.items.prefix(3)) { ItemRow(item: $0) }
            } else {
                EmptyView_(label: entry.snapshot?.emptyLabel ?? "—")
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct LargeWidgetView: View {
    let entry: DaEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(entry.snapshot?.greeting ?? "Dijital Asistan")
                .font(.system(size: 15, weight: .semibold))
            Text(entry.snapshot?.headline ?? "").font(.system(size: 12)).foregroundStyle(.secondary)
            Divider()
            if let snapshot = entry.snapshot, !snapshot.items.isEmpty {
                ForEach(snapshot.items.prefix(4)) { ItemRow(item: $0) }
            } else {
                EmptyView_(label: entry.snapshot?.emptyLabel ?? "—")
            }
            Spacer(minLength: 0)
            if let title = entry.snapshot?.nextEventTitle {
                Divider()
                HStack(spacing: 5) {
                    Image(systemName: "calendar").font(.system(size: 11))
                    Text(title).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    if let time = entry.snapshot?.nextEventTime {
                        Spacer(minLength: 4)
                        Text(time).font(.system(size: 12)).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct LockScreenView: View {
    let entry: DaEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("\\(entry.snapshot?.priorityCount ?? 0)").font(.system(size: 20, weight: .bold))
            Text(entry.snapshot?.items.first?.title ?? entry.snapshot?.emptyLabel ?? "—")
                .font(.system(size: 11)).lineLimit(2)
        }
        .widgetURL(link("today"))
    }
}

struct DijitalAsistanWidgetEntryView: View {
    @Environment(\\.widgetFamily) var family
    var entry: Provider.Entry

    var body: some View {
        switch family {
        case .systemSmall: SmallWidgetView(entry: entry)
        case .systemLarge: LargeWidgetView(entry: entry)
        case .accessoryRectangular: LockScreenView(entry: entry)
        default: MediumWidgetView(entry: entry)
        }
    }
}

@main
struct DijitalAsistanWidget: Widget {
    let kind: String = "DijitalAsistanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                DijitalAsistanWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                DijitalAsistanWidgetEntryView(entry: entry).padding()
            }
        }
        .configurationDisplayName("Dijital Asistan")
        .description("Bugün bilmen gerekenler.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}
`

const withIosWidget = (config) => {
  const appGroup =
    process.env.APP_IOS_APP_GROUP?.trim() ||
    config.ios?.entitlements?.['com.apple.security.application-groups']?.[0] ||
    'group.com.dijitalasistan.app'
  const scheme = typeof config.scheme === 'string' ? config.scheme : 'dijitalasistan'

  config = withEntitlementsPlist(config, (cfg) => {
    const key = 'com.apple.security.application-groups'
    const groups = Array.isArray(cfg.modResults[key]) ? cfg.modResults[key] : []
    if (!groups.includes(appGroup)) groups.push(appGroup)
    cfg.modResults[key] = groups
    return cfg
  })

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
      fs.writeFileSync(path.join(dir, SOURCE_FILE), WIDGET_SWIFT(appGroup, scheme), 'utf8')
      return cfg
    },
  ])

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const objects = project.hash.project.objects
    const bundleId = `${cfg.ios?.bundleIdentifier ?? 'com.dijitalasistan.app'}.widget`

    // `addTarget` stores the target's name quoted, and `pbxTargetByName`
    // matches the stored comment verbatim, so only the quoted form finds a
    // target this plugin created. Checking the bare name alone would miss it
    // and add a second copy of the target on every prebuild over an existing
    // project.
    if (project.pbxTargetByName(`"${TARGET_NAME}"`) ?? project.pbxTargetByName(TARGET_NAME)) {
      return cfg
    }

    // Project-relative child paths with an empty group path, rather than bare
    // names under a group whose path is the target folder: `xcode` matches an
    // existing file reference by path alone, so two extensions that each
    // registered a bare `Info.plist` would silently share one reference.
    const group = project.addPbxGroup(
      [`${TARGET_NAME}/Info.plist`, `${TARGET_NAME}/${TARGET_NAME}.entitlements`],
      TARGET_NAME,
      // An empty group path, written the way `xcode` needs it quoted, so the
      // group inherits the project directory and its children keep the unique
      // project-relative paths above.
      '""',
    )
    const groups = objects.PBXGroup
    Object.keys(groups).forEach((key) => {
      if (groups[key].name === undefined && groups[key].path === undefined) {
        project.addToPbxGroup(group.uuid, key)
      }
    })

    // `addTarget` makes the extension a dependency of the app target, but only
    // writes it when both of these sections already exist — and the Expo
    // template ships with neither, having no target dependencies of its own.
    // Without them the app embeds an `.appex` whose build order is left to
    // Xcode's implicit-dependency resolution.
    objects.PBXTargetDependency = objects.PBXTargetDependency ?? {}
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {}

    const target = project.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, bundleId)
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)

    // Added after the Sources phase exists, because `addSourceFile` reaches the
    // phase through the target's own build-phase list. It returns false when a
    // file reference for the path is already registered, which is why the Swift
    // file is deliberately not part of the group above: registering it there
    // first is exactly what left this target compiling nothing at all.
    const source = project.addSourceFile(
      `${TARGET_NAME}/${SOURCE_FILE}`,
      { target: target.uuid },
      group.uuid,
    )
    if (!source) {
      throw new Error(
        `withIosWidget: ${SOURCE_FILE} did not reach the ${TARGET_NAME} Sources phase; the widget would ship empty.`,
      )
    }

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
      // The Info.plist above resolves both from build settings. Left undefined
      // they expand to empty strings, and an extension whose version does not
      // match the app's is rejected at App Store validation.
      buildSettings.MARKETING_VERSION = `"${cfg.version ?? '1.0.0'}"`
      buildSettings.CURRENT_PROJECT_VERSION = `"${cfg.ios?.buildNumber ?? '1'}"`
    }

    return cfg
  })

  return config
}

module.exports = withIosWidget
