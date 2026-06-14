#!/usr/bin/env python3
"""
Talk2Me — Worker GPU (API). Expose à Talk2Me, sur NOTRE machine :
  GET  /health                 → état + modèles chargés
  POST /image  {prompt,w,h}    → image FLUX (PNG base64)        [GPU]
  POST /tts    {text,lang}     → voix XTTS (MP3/WAV base64)     [GPU]
Auth : header  Authorization: Bearer <token>  (fichier .worker-token).
Les modèles se chargent au 1er appel (lazy) pour un démarrage rapide.
Open-source uniquement → indépendance totale (ni fal, ni HF, ni ElevenLabs).
"""
import base64, io, os, pathlib, tempfile
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

TOKEN = pathlib.Path(__file__).with_name(".worker-token").read_text().strip() if pathlib.Path(__file__).with_name(".worker-token").exists() else ""
app = FastAPI(title="Talk2Me GPU Worker")

_flux = None     # pipeline image
_xtts = None      # modèle voix

def _auth(authorization: str):
    if not TOKEN:
        return
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="bad_token")

def get_flux():
    global _flux
    if _flux is None:
        import os, torch
        from diffusers import AutoPipelineForText2Image
        # FLUX.1-schnell est "gated" (licence HF à accepter). Par défaut SDXL-Turbo :
        # non-restreint, rapide (1-4 pas, guidance 0), bonne qualité. Pour FLUX :
        # GPU_IMAGE_MODEL=black-forest-labs/FLUX.1-schnell + HF_TOKEN ayant accepté la licence.
        model = os.environ.get("GPU_IMAGE_MODEL", "stabilityai/sdxl-turbo")
        kw = {"torch_dtype": torch.float16}
        if "sdxl-turbo" in model:
            kw["variant"] = "fp16"
        _flux = AutoPipelineForText2Image.from_pretrained(model, **kw).to("cuda")
    return _flux

def get_xtts():
    global _xtts
    if _xtts is None:
        from TTS.api import TTS
        _xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")
    return _xtts

@app.get("/health")
def health():
    cuda = False
    try:
        import torch; cuda = torch.cuda.is_available()
    except Exception:
        pass
    return {"ok": True, "cuda": cuda, "flux_loaded": _flux is not None, "xtts_loaded": _xtts is not None}

@app.post("/llm")
async def llm(payload: dict, authorization: str = Header(default="")):
    """Texte via Ollama local (Llama 3.1) — remplace DeepSeek. JSON optionnel."""
    _auth(authorization)
    import urllib.request, json as _json
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt_required")
    body = {
        "model": payload.get("model") or os.environ.get("OLLAMA_MODEL", "llama3.1:8b"),
        "prompt": prompt,
        "system": payload.get("system") or "",
        "stream": False,
        "options": {"temperature": float(payload.get("temperature", 0.7))},
    }
    if payload.get("json"):
        body["format"] = "json"
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=_json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        out = _json.loads(urllib.request.urlopen(req, timeout=180).read())
        return JSONResponse({"ok": True, "text": out.get("response", "")})
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"ollama_error: {e}")

@app.post("/image")
async def image(payload: dict, authorization: str = Header(default="")):
    _auth(authorization)
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt_required")
    w = int(payload.get("width", 1024)); h = int(payload.get("height", 1024))
    steps = int(payload.get("steps", 4))  # schnell = rapide (4 pas)
    img = get_flux()(prompt=prompt, width=w, height=h, num_inference_steps=steps, guidance_scale=0.0).images[0]
    buf = io.BytesIO(); img.save(buf, format="PNG")
    return JSONResponse({"ok": True, "b64": base64.b64encode(buf.getvalue()).decode()})

@app.post("/tts")
async def tts(payload: dict, authorization: str = Header(default="")):
    _auth(authorization)
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text_required")
    lang = payload.get("lang", "fr")
    speaker_wav = payload.get("speaker_wav")  # optionnel : clonage de voix
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    kw = {"text": text, "language": lang, "file_path": out}
    if speaker_wav:
        kw["speaker_wav"] = speaker_wav
    else:
        kw["speaker"] = get_xtts().speakers[0] if getattr(get_xtts(), "speakers", None) else None
    get_xtts().tts_to_file(**{k: v for k, v in kw.items() if v is not None})
    data = pathlib.Path(out).read_bytes(); os.unlink(out)
    return JSONResponse({"ok": True, "b64": base64.b64encode(data).decode(), "format": "wav"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
