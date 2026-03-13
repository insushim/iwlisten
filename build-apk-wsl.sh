#!/bin/bash
# Build ISW English APK via WSL
# Usage: wsl bash build-apk-wsl.sh
# Prerequisites: JDK 17, Android SDK installed in WSL

set -e

VERSION=$(node -p "require('./package.json').version")
APK_NAME="ISW-English-v${VERSION}.apk"

echo "=== ISW English APK Builder ==="
echo "Version: $VERSION"

cd "$(dirname "$0")/webview-apk"

# Check Java
if ! command -v java &> /dev/null; then
    echo "ERROR: JDK 17 not found. Install with:"
    echo "  sudo apt install openjdk-17-jdk"
    exit 1
fi

# Check ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
    # Try common locations
    for d in ~/Android/Sdk /usr/local/lib/android/sdk $HOME/android-sdk; do
        if [ -d "$d" ]; then
            export ANDROID_HOME="$d"
            break
        fi
    done
fi

if [ -z "$ANDROID_HOME" ]; then
    echo "ERROR: ANDROID_HOME not set. Install Android SDK:"
    echo "  sudo apt install android-sdk"
    echo "  export ANDROID_HOME=~/Android/Sdk"
    exit 1
fi

echo "ANDROID_HOME: $ANDROID_HOME"
echo "JAVA_HOME: $(java -XshowSettings:properties -version 2>&1 | grep 'java.home' | awk '{print $3}')"

# Generate Gradle wrapper if missing
if [ ! -f "gradlew" ]; then
    echo "Generating Gradle wrapper..."
    gradle wrapper --gradle-version 8.5
fi

chmod +x gradlew

echo "Stamping version into web and APK sources..."
cd ..
RELEASE_VERSION="$VERSION" RELEASE_CODE=1 node scripts/stamp-version.js
cd webview-apk

echo "Building release APK..."
./gradlew assembleRelease

# Find the APK
APK=$(find . -name "*.apk" -path "*/release/*" | head -1)
if [ -z "$APK" ]; then
    echo "ERROR: No APK found!"
    exit 1
fi

cp "$APK" "../$APK_NAME"
echo ""
echo "=== Build Complete ==="
echo "APK: ../$APK_NAME"
echo "Size: $(du -h "../$APK_NAME" | cut -f1)"
