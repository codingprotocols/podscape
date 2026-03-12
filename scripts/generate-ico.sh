#!/bin/bash

# Check if ImageMagick 'convert' is available
if ! command -v convert &> /dev/null; then
    echo "This script requires ImageMagick 'convert' command."
    exit 1
fi

SOURCE_PNG=$1
DEST_ICO=$2

if [ -z "$SOURCE_PNG" ] || [ -z "$DEST_ICO" ]; then
    echo "Usage: $0 <source.png> <destination.ico>"
    exit 1
fi

if [ ! -f "$SOURCE_PNG" ]; then
    echo "Error: Source file $SOURCE_PNG does not exist."
    exit 1
fi

echo "Generating ICO from $SOURCE_PNG..."

# Generate a multi-resolution ICO file using ImageMagick
convert "$SOURCE_PNG" -define icon:auto-resize=16,24,32,48,64,128,256 "$DEST_ICO"

echo "Done! Generated $DEST_ICO"
