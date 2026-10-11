#!/usr/bin/env bash
# Render a Markdown-derived brief page to PDF with headless Chrome.
#
# The Arabic text needs a shaping engine, which the PDF library in this project
# does not have (see docs/ASSUMPTIONS.md), so the browser does the rendering.
# The HTML is self-contained, so nothing is fetched while it prints.
#
#   scripts/render-brief-pdf.sh [input.html] [output.pdf]
#
# Nothing is published; the PDF is written locally and is not committed.
set -euo pipefail

INPUT="${1:-docs/DECISION-BRIEF-T01-P01.html}"
OUTPUT="${2:-artifacts/decision-brief/$(basename "${INPUT%.html}").pdf}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

[ -f "$INPUT" ] || { echo "Input not found: $INPUT" >&2; exit 1; }
[ -x "$CHROME" ] || { echo "Chrome not found. Set CHROME to the binary." >&2; exit 1; }

mkdir -p "$(dirname "$OUTPUT")"
"$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --print-to-pdf="$(cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")" \
  "file://$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")" 2>/dev/null

echo "PDF written: $OUTPUT ($(wc -c < "$OUTPUT" | tr -d ' ') bytes)"
