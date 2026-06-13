#!/bin/bash
# setup_deps.sh
# Script to add and initialize git submodules for the video editor monorepo.
# Run this from the repository root.

set -euo pipefail

echo "============================================="
echo "Initializing Video Editor Vendor Dependencies"
echo "============================================="

# Define the submodules as a list of "URL|PATH"
SUBMODULES=(
    "https://github.com/mltframework/shotcut.git|vendor/shotcut"
    "https://github.com/opencodewin/MediaEditor.git|vendor/MediaEditor"
    "https://github.com/showlab/Kiwi-Edit.git|vendor/Kiwi-Edit"
)

# Create vendor directory if it doesn't exist
mkdir -p vendor

# Loop through and register each submodule if not already present
for entry in "${SUBMODULES[@]}"; do
    IFS="|" read -r URL DEST <<< "$entry"
    
    if [ -d "$DEST" ] && [ -f "$DEST/.git" ]; then
        echo "[-] Submodule at $DEST is already present. Skipping add."
    else
        echo "[+] Adding submodule: $URL -> $DEST"
        # Check if the submodule is already in .gitmodules but missing from disk
        if git config --file .gitmodules --get "submodule.${DEST}.path" > /dev/null 2>&1; then
            echo "[!] Submodule registered in .gitmodules but directory missing. Restoring..."
        else
            git submodule add "$URL" "$DEST"
        fi
    fi
done

echo "[+] Initializing and updating all submodules..."
git submodule update --init --recursive

echo "============================================="
echo "Dependencies setup completed successfully!"
echo "============================================="
