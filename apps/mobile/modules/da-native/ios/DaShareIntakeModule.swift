import ExpoModulesCore

/**
 Items the share extension queued while the app was closed.

 The extension cannot talk to the app directly, so it appends to a queue in the
 App Group's `UserDefaults` and copies any shared files into the group
 container. Draining is destructive on purpose: the JS layer takes ownership of
 what it receives, which is what stops the same capture being created twice
 after a failed upload.
 */
public class DaShareIntakeModule: Module {
  private var appGroup: String {
    Bundle.main.object(forInfoDictionaryKey: "DAAppGroup") as? String
      ?? "group.com.dijitalasistan.app"
  }

  public func definition() -> ModuleDefinition {
    Name("DaShareIntake")

    Function("drainPendingCaptures") { () -> [[String: Any]] in
      guard let defaults = UserDefaults(suiteName: self.appGroup) else { return [] }
      let queue = defaults.array(forKey: "pendingCaptures") as? [[String: Any]] ?? []
      defaults.removeObject(forKey: "pendingCaptures")
      return queue
    }

    Function("sharedContainerPath") { () -> String? in
      FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: self.appGroup)?
        .appendingPathComponent("captures", isDirectory: true)
        .path
    }
  }
}
