#!/bin/zsh
set -eu
cd "${0:A:h}"
if [[ ! -x build/Cardfolio.app/Contents/MacOS/Cardfolio ]]; then
  ./build-mac.sh
fi
open "$PWD/build/Cardfolio.app"
