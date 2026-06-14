# Talk2Me — Worker GPU

Stack IA OPEN sur notre propre GPU loué → indépendance (ni fal, ni HF, ni ElevenLabs).

## Déploiement (3 étapes)
1. Loue une instance GPU (RunPod RTX 4090 ~0,40 €/h, ou OVH L4/L40S) — Ubuntu + CUDA, ~200 Go disque.
2. `bash install.sh`  (installe FLUX images + XTTS voix + Whisper + Ollama LLM)
3. `bash run.sh`      (worker sur le port 8000)

## Brancher à Talk2Me
Dans le `.env` de Talk2Me :
```
GPU_WORKER_URL=http://<IP_INSTANCE>:8000
GPU_WORKER_TOKEN=<contenu de gpu-worker/.worker-token>
```

## API
- `GET  /health`
- `POST /image  {prompt,width,height,steps}` → image FLUX (PNG base64)
- `POST /tts    {text,lang,speaker_wav?}`     → voix XTTS (WAV base64, clonage optionnel)

## Optionnel (modèles vidéo lourds)
- Vidéo : Wan / LTX-Video via ComfyUI + custom nodes
- Talking-head : LatentSync / LivePortrait (clone repo + pip)
→ demander les commandes exactes le moment venu.
