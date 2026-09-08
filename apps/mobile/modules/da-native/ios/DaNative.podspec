require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

#
# The Apple half of the local Expo module.
#
# Expo's autolinking resolves an Apple package only when it finds a podspec in
# one of the package's top-level directories; without this file the two Swift
# modules next to it are never compiled into the app, `requireOptionalNativeModule`
# returns null on iOS, and the widget and share-extension intake silently do
# nothing on every Apple build.
#
# The pod name is also the Swift module name the generated `ExpoModulesProvider`
# imports, so it has to stay a plain identifier and stay in sync with
# `swiftModuleName` in expo-module.config.json.
#
Pod::Spec.new do |s|
  s.name           = 'DaNative'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Dijital Asistan'
  s.homepage       = 'https://dijitalasistan.app'
  # Matches `expo-build-properties` in app.config.ts. A higher floor here would
  # make CocoaPods skip the pod for the app's target instead of failing loudly.
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
