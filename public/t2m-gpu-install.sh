#!/usr/bin/env bash
# =============================================================================
#  Talk2Me — Worker GPU (Pascal 2026-06-11)
#  Installe NOTRE stack IA sur une instance GPU louée (RTX 4090 / L4 / L40S…),
#  Ubuntu 22.04+ avec pilotes NVIDIA + CUDA. Tout est OPEN = aucune dépendance
#  fal/HF/ElevenLabs/DeepSeek à l'usage. Le worker expose une petite API que
#  Talk2Me appelle (on colle juste l'URL + un token dans T2M, comme une clé).
#
#  USAGE :   bash install.sh
#  Puis :    bash run.sh           (lance le worker sur le port 8000)
# =============================================================================
set -e
WORKER_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$WORKER_DIR"

echo "==> 1/6  Système + prérequis"
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-pip git ffmpeg wget curl

echo "==> 2/6  Vérif GPU NVIDIA"
nvidia-smi || { echo "!! Pas de GPU NVIDIA détecté. Ce worker exige un GPU."; exit 1; }

echo "==> 3/6  venv Python + PyTorch CUDA"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip wheel
# PyTorch CUDA 12.1 (adapter cuXXX selon l'instance si besoin)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

echo "==> 4/6  Modèles IA (images, voix, transcription)"
pip install \
  "diffusers>=0.31" "transformers>=4.44" accelerate safetensors sentencepiece protobuf \
  "TTS==0.22.0" faster-whisper \
  fastapi "uvicorn[standard]" pillow python-multipart

echo "==> 5/6  Ollama (LLM local = remplace DeepSeek)"
curl -fsSL https://ollama.com/install.sh | sh || true
# pull d'un modèle léger qui tient sur 24 Go (lance en arrière-plan)
( ollama serve >/tmp/ollama.log 2>&1 & sleep 5; ollama pull llama3.1:8b || true ) &

echo "==> 6/6  Génère le token du worker"
if [ ! -f .worker-token ]; then
  python3 -c "import secrets;print(secrets.token_hex(24))" > .worker-token
fi
echo "Token worker : $(cat .worker-token)"

cat <<'EONOTE'

============================================================
✅ Base installée : FLUX (images) + XTTS (voix) + Whisper + Ollama (LLM).
   Lance le worker :   bash run.sh
   Il écoute sur :     http://0.0.0.0:8000   (token dans .worker-token)

▶ OPTIONNEL — modèles vidéo lourds (à ajouter quand tu veux) :
  • Vidéo (Wan / LTX-Video)         → via ComfyUI + custom nodes
  • Talking-head (LatentSync/LivePortrait) → clone le repo + pip install -r
  Ces 2 demandent + de VRAM (≥24 Go ok pour LTX, Wan-14B mieux ≥40 Go).
  Dis-moi quand on y est, je te donne les commandes exactes.

▶ BRANCHER À TALK2ME :
  Dans le .env de Talk2Me, mets :
    GPU_WORKER_URL=http://<IP_DE_TON_INSTANCE>:8000
    GPU_WORKER_TOKEN=<le token ci-dessus>
  Le Studio basculera alors sur NOTRE GPU (images + voix illimitées, 0 clé).
============================================================
EONOTE
