#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Run from the repository root. CI and Pages must exercise the same package.
set -eu
output=${1:-public}
mkdir -p "$output/js" "$output/assets" "$output/vendor/vanillajs"
cp index.html style.css sw.js LICENSE "$output/"
cp js/*.js "$output/js/"
cp assets/*.svg "$output/assets/"
# Keep the audio renderer together with its licence, source and provenance.
cp vendor/vanillajs/* "$output/vendor/vanillajs/"
touch "$output/.nojekyll"
