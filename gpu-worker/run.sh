#!/usr/bin/env bash
# Lance le worker GPU Talk2Me (port 8000). À exécuter après install.sh.
set -e
cd "$(dirname "$0")"
. .venv/bin/activate
# s'assure qu'Ollama tourne (LLM local)
pgrep -x ollama >/dev/null || ( ollama serve >/tmp/ollama.log 2>&1 & )
echo "Worker GPU sur http://0.0.0.0:8000  (token: $(cat .worker-token 2>/dev/null))"
exec python worker.py
