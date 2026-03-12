#!/bin/bash

# Check if required tools are available
if ! command -v sips &> /dev/null || ! command -v iconutil &> /dev/null; then
    echo "This script requires 'sips' and 'iconutil' which are available on macOS."
    exit 1
fi

SOURCE_PNG=$1
DEST_ICNS=$2

if [ -z "$SOURCE_PNG" ] || [ -z "$DEST_ICNS" ]; then
    echo "Usage: $0 <source.png> <destination.icns>"
    exit 1
fi

if [ ! -f "$SOURCE_PNG" ]; then
    echo "Error: Source file $SOURCE_PNG does not exist."
    exit 1
fi

ICONSET_NAME="icon.iconset"
mkdir -p "$ICONSET_NAME"

echo "Resizing images..."

# Standard icon sizes for macOS
sips -z 16 16     "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_16x16.png"
sips -z 32 32     "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_32x32.png"
sips -z 64 64     "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_128x128.png"
sips -z 256 256   "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_256x256.png"
sips -z 512 512   "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_512x512.png"
sips -z 1024 1024 "$SOURCE_PNG" --out "${ICONSET_NAME}/icon_512x512@2x.png"

echo "Converting to ICNS..."
iconutil -c icns "$ICONSET_NAME" -o "$DEST_ICNS"

echo "Cleaning up..."
rm -rf "$ICONSET_NAME"

echo "Done! Generated $DEST_ICNS"
