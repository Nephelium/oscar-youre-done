#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$project_root"
device="${OSCAR_SIMULATOR_ID:-}"
if [[ -z "$device" ]]; then
  device="$(xcrun simctl list devices available -j | python3 -c 'import sys,json; ds=[d for r,items in json.load(sys.stdin)["devices"].items() if "iOS" in r for d in items if d.get("isAvailable") and "iPhone" in d["name"]]; ds.sort(key=lambda d:d["state"]!="Booted"); print(ds[0]["udid"] if ds else "")')"
fi
if [[ -z "$device" ]]; then
  echo '请先在 Xcode 下载 iOS 模拟器平台。' >&2
  exit 1
fi
product="$project_root/ios/build/Release/Build/Products/Release-iphonesimulator/Oscar.app"
if [[ "${1:-}" == '--build' || ! -d "$product" ]]; then
  python3 ios/scripts/generate_project.py
  xcodebuild -project ios/build/Oscar.xcodeproj -scheme Oscar -configuration Release \
    -destination "platform=iOS Simulator,id=$device" -derivedDataPath ios/build/Release \
    CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES build
fi
if ! xcrun simctl list devices booted | grep -Fq "$device"; then
  xcrun simctl boot "$device"
fi
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$product"
xcrun simctl launch "$device" com.jingjing.chesssprout.ios
developer_dir="$(xcode-select -p)"
# Xcode 27 hosts simulator windows in DeviceHub; earlier Xcode uses Simulator.
for viewer in "$developer_dir/Applications/Simulator.app" "$developer_dir/../Applications/Simulator.app" "$developer_dir/../Applications/DeviceHub.app"; do
  if [[ -d "$viewer" ]]; then
    open "$viewer"
    break
  fi
done
