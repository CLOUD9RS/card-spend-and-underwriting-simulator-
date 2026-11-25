#!/bin/zsh
set -eu
cd "${0:A:h}"
bundle="$PWD/build/Cardfolio.app"
res="$bundle/Contents/Resources"
mkdir -p "$bundle/Contents/MacOS" "$res/static" build/module-cache
swiftc -O -module-cache-path "$PWD/build/module-cache" macos/Cardfolio.swift -o "$bundle/Contents/MacOS/Cardfolio"
swiftc -O -module-cache-path "$PWD/build/module-cache" macos/ReportReader.swift -o "$res/report-reader"
cp "$res/report-reader" build/report-reader
cp macos/Info.plist "$bundle/Contents/Info.plist"
cp app.py archives.py credit.py importer.py ledger.py phone.py statements.py wealth.py mail-reader.js "$res/"
cp static/* "$res/static/"
python3 - "$res/Cardfolio.icns" <<'PYICON'
import struct
import sys
from pathlib import Path
png=Path("static/app-icon.png").read_bytes()
chunk=b"ic09"+struct.pack(">I",len(png)+8)+png
Path(sys.argv[1]).write_bytes(b"icns"+struct.pack(">I",len(chunk)+8)+chunk)
PYICON
codesign --force --sign - "$res/report-reader"
codesign --force --sign - "$bundle"
codesign --verify --strict "$bundle"
echo "Built $bundle"
