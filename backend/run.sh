#!/usr/bin/env bash
# Local development server. Creates the venv, installs dependencies, and runs
# the API with auto-reload. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"

if ! command -v "$PY" >/dev/null 2>&1; then
  echo "error: '$PY' not found. Install Python 3.10+ first." >&2
  echo "  Ubuntu/Debian:  sudo apt update && sudo apt install -y python3 python3-venv" >&2
  echo "  macOS:          brew install python" >&2
  exit 1
fi

# A venv directory can exist while being unusable. On Debian/Ubuntu the venv
# module ships separately (python3-venv); without it `python3 -m venv` creates
# the directory, fails at ensurepip, and leaves a shell with no bin/activate —
# so the *next* run skips creation and dies with "No such file".
if [ -d .venv ] && [ ! -f .venv/bin/activate ]; then
  echo "note: removing a partially-created .venv (no bin/activate)" >&2
  rm -rf .venv
fi

if [ ! -d .venv ]; then
  ERR_LOG="$(mktemp)"
  if ! "$PY" -m venv .venv 2>"$ERR_LOG"; then
    rm -rf .venv
    PYVER="$("$PY" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    {
      echo
      echo "error: could not create the virtual environment."
      sed 's/^/  /' "$ERR_LOG"
      echo
      echo "On Ubuntu/Debian the venv module is a separate package. Install it with:"
      echo
      echo "  sudo apt update && sudo apt install -y python3-venv python${PYVER}-venv"
      echo
      echo "then run ./run.sh again."
    } >&2
    rm -f "$ERR_LOG"
    exit 1
  fi
  rm -f "$ERR_LOG"
fi

# Use the venv's interpreter directly rather than `source activate` — it behaves
# identically under sh, bash, zsh and fish, and fails loudly if the venv is bad.
VENV_PY=".venv/bin/python"
if [ ! -x "$VENV_PY" ]; then
  echo "error: $VENV_PY is missing. Delete the venv and retry:" >&2
  echo "  rm -rf .venv && ./run.sh" >&2
  exit 1
fi

"$VENV_PY" -m pip install --quiet --upgrade pip
"$VENV_PY" -m pip install --quiet -r requirements.txt

[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }

echo "starting on http://localhost:8000  (admin dashboard at /admin.html)"
exec "$VENV_PY" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
