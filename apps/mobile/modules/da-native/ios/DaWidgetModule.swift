import ExpoModulesCore
import WidgetKit

/**
 The app side of the home-screen widget.

 The widget extension has no session and never makes a request; it renders a
 snapshot the app writes into the shared App Group container. This module is
 the only thing that writes it, and `reloadAllTimelines` is what makes a fresh
 briefing appear on the home screen without waiting for the system's own
 refresh budget.
 */
public class DaWidgetModule: Module {
  /// Kept in sync with `APP_IOS_APP_GROUP` in app.config.ts.
  private var appGroup: String {
    Bundle.main.object(forInfoDictionaryKey: "DAAppGroup") as? String
      ?? "group.com.dijitalasistan.app"
  }

  public func definition() -> ModuleDefinition {
    Name("DaWidget")

    Function("setSnapshot") { (json: String) -> Bool in
      guard let defaults = UserDefaults(suiteName: self.appGroup) else { return false }
      defaults.set(json, forKey: "widgetSnapshot")
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
      return true
    }

    Function("clearSnapshot") { () -> Bool in
      guard let defaults = UserDefaults(suiteName: self.appGroup) else { return false }
      defaults.removeObject(forKey: "widgetSnapshot")
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
      return true
    }
  }
}
