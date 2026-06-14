#!/usr/bin/env bash
# Talk2Me — Déploie l'endpoint /avatar (Léa parlante, Wav2Lip) sur le pod GPU.
# Usage :  ./deploy-avatar.sh root@<HOST> <PORT>
#   (HOST + PORT = onglet « Connect » de RunPod ; changent à chaque restart.)
#
# Ce script, SUR LE POD :
#   1. clone Wav2Lip + télécharge le checkpoint wav2lip_gan.pth dans /workspace
#   2. installe les deps (librosa, opencv, batch-face) dans le venv du worker
#   3. ajoute avatar_endpoint.py à côté du worker.py LIVE et branche la route
#   4. relance le worker
# NB : on PATCHE le worker live (qui a déjà /img2img + /cutout) — on n'écrase pas.
set -euo pipefail
SSH_TARGET="${1:?usage: deploy-avatar.sh root@HOST PORT}"
SSH_PORT="${2:?usage: deploy-avatar.sh root@HOST PORT}"
KEY="$HOME/.ssh/runpod_t2m"
SSH="ssh -i $KEY -p $SSH_PORT -o StrictHostKeyChecking=no $SSH_TARGET"
SCP="scp -i $KEY -P $SSH_PORT -o StrictHostKeyChecking=no"

echo "▸ 1/4 Wav2Lip + checkpoint"
$SSH 'bash -s' <<'REMOTE'
set -e
cd /workspace
[ -d Wav2Lip ] || git clone https://github.com/Rudrabha/Wav2Lip.git
cd Wav2Lip
mkdir -p checkpoints
if [ ! -f checkpoints/wav2lip_gan.pth ]; then
  # miroir public du checkpoint (≈ 400 Mo)
  wget -q -O checkpoints/wav2lip_gan.pth \
    "https://huggingface.co/numz/wav2lip_studio/resolve/main/Wav2lip/wav2lip_gan.pth" || \
  wget -q -O checkpoints/wav2lip_gan.pth \
    "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/wav2lip_gan.pth"
fi
# détecteur de visage s3fd
mkdir -p face_detection/detection/sfd
[ -f face_detection/detection/sfd/s3fd.pth ] || \
  wget -q -O face_detection/detection/sfd/s3fd.pth \
    "https://huggingface.co/numz/wav2lip_studio/resolve/main/Wav2lip/s3fd.pth" || true
echo "  Wav2Lip prêt : $(ls -la checkpoints/wav2lip_gan.pth | awk '{print $5}') octets"
REMOTE

echo "▸ 2/4 dépendances python"
$SSH 'pip install -q librosa==0.10.2 opencv-python-headless numba batch-face || true'

echo "▸ 3/4 endpoint + patch worker.py"
$SCP "$(dirname "$0")/avatar_endpoint.py" "$SSH_TARGET:/workspace/app/avatar_endpoint.py"
$SSH 'bash -s' <<'REMOTE'
set -e
cd /workspace/app
# branche la route si pas déjà fait (idempotent)
if ! grep -q "_register_avatar" worker.py; then
  cat >> worker.py <<'PY'

# --- Talk2Me /avatar (Léa parlante, Wav2Lip) ---
try:
    from avatar_endpoint import _register_avatar
    _register_avatar(app, _auth)
    print("avatar endpoint registered")
except Exception as _e:
    print("avatar endpoint NOT registered:", _e)
PY
  echo "  worker.py patché"
else
  echo "  worker.py déjà patché"
fi
REMOTE

echo "▸ 4/4 redémarrage worker"
$SSH 'pkill -f "uvicorn|worker.py" || true; sleep 2; cd /workspace/app && nohup bash run.sh > /workspace/worker.log 2>&1 & sleep 6; curl -s http://127.0.0.1:8000/openapi.json | python3 -c "import json,sys;print(\"routes:\", list(json.load(sys.stdin)[\"paths\"].keys()))"'
echo "✅ /avatar déployé. Teste : POST <proxy>/avatar { face_b64, audio_b64 }"
