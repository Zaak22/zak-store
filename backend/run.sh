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

# Generous network settings. pip's default is a 15s read timeout with 5 retries,
# which is not enough on a slow or restricted link — aiohttp (a pywebpush
# dependency, and one of the largest wheels here) is usually the first to fail.
PIP_NET=(--timeout 120 --retries 10)

"$VENV_PY" -m pip install --quiet --upgrade pip "${PIP_NET[@]}"

if ! "$VENV_PY" -m pip install --quiet -r requirements.txt "${PIP_NET[@]}"; then
  {
    echo
    echo "error: dependency install failed."
    echo
    echo "If you saw ReadTimeoutError against pypi.org, it is a network problem,"
    echo "not a problem with the project. Options, in order:"
    echo
    echo "  1. Just run ./run.sh again — pip resumes from its cache, so each"
    echo "     attempt gets further."
    echo
    echo "  2. Be even more patient:"
    echo "       .venv/bin/python -m pip install -r requirements.txt --timeout 300 --retries 20"
    echo
    echo "  3. Use a different PyPI mirror if pypi.org is throttled where you are:"
    echo "       .venv/bin/python -m pip install -r requirements.txt \\"
    echo "         --index-url https://pypi.tuna.tsinghua.edu.cn/simple"
    echo
    echo "  4. Or install on a machine with better connectivity and copy the"
    echo "     whole backend/.venv directory across (same OS and CPU required)."
  } >&2
  exit 1
fi

[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }

echo "starting on http://localhost:8000  (admin dashboard at /admin.html)"
exec "$VENV_PY" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
