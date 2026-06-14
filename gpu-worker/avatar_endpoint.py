#!/usr/bin/env python3
"""
Talk2Me — Worker GPU : endpoint /avatar (Léa parlante, lip-sync).
À AJOUTER au worker.py DÉPLOYÉ sur le pod (qui a déjà /img2img + /cutout — NE PAS
écraser le worker live avec la copie repo plus ancienne). Voir deploy-avatar.sh.

Entrée  : POST /avatar { face_b64 (PNG/JPG) | face_url, audio_b64 (WAV), width, height }
Sortie  : { ok, b64 (MP4 H.264), format:"mp4" }
Moteur  : Wav2Lip (lip-sync sur une image fixe = tête parlante) + GFPGAN optionnel.
          Le visage Léa (cohérent) est fourni par Talk2Me (SDXL, mis en cache).

Dépend de : /workspace/Wav2Lip (repo + checkpoints/wav2lip_gan.pth), ffmpeg.
Repli : si Wav2Lip indisponible → 503 ; le Composer retombe sur le montage image+voix.
"""
import base64, os, pathlib, subprocess, tempfile, urllib.request
from fastapi import Header, HTTPException
from fastapi.responses import JSONResponse

WAV2LIP_DIR = os.environ.get("WAV2LIP_DIR", "/workspace/Wav2Lip")
WAV2LIP_CKPT = os.environ.get("WAV2LIP_CKPT", "/workspace/Wav2Lip/checkpoints/wav2lip_gan.pth")
# Wav2Lip tourne dans SON venv (librosa/cv2), PAS celui du worker.
WAV2LIP_PY = os.environ.get("WAV2LIP_PY", "/workspace/venv-avatar/bin/python")


def _register_avatar(app, _auth):
    """Branche la route /avatar sur l'app FastAPI existante (appelé depuis worker.py)."""

    @app.post("/avatar")
    async def avatar(payload: dict, authorization: str = Header(default="")):
        _auth(authorization)
        if not pathlib.Path(WAV2LIP_CKPT).exists():
            raise HTTPException(status_code=503, detail="wav2lip_not_installed")

        face_b64 = payload.get("face_b64")
        face_url = payload.get("face_url")
        audio_b64 = payload.get("audio_b64")
        if not audio_b64 or (not face_b64 and not face_url):
            raise HTTPException(status_code=400, detail="face_and_audio_required")

        # Libère la VRAM d'Ollama (modèles chat/vision) AVANT Wav2Lip : sinon
        # SDXL + XTTS + Ollama saturent le GPU → Wav2Lip OOM. keep_alive=0 décharge.
        try:
            import urllib.request as _u, json as _j
            for _m in (os.environ.get("GPU_LLM_MODEL", "llama3.1:8b"), os.environ.get("GPU_VISION_MODEL", "qwen2.5vl:3b")):
                _r = _u.Request("http://127.0.0.1:11434/api/generate",
                                data=_j.dumps({"model": _m, "keep_alive": 0}).encode(),
                                headers={"Content-Type": "application/json"})
                _u.urlopen(_r, timeout=20).read()
            import time as _t; _t.sleep(2)
        except Exception:
            pass
        try:
            import torch; torch.cuda.empty_cache()
        except Exception:
            pass

        work = tempfile.mkdtemp(prefix="lea_")
        face_p = os.path.join(work, "face.png")
        audio_p = os.path.join(work, "voice.wav")
        out_p = os.path.join(work, "lea.mp4")
        try:
            if face_b64:
                pathlib.Path(face_p).write_bytes(base64.b64decode(face_b64))
            else:
                urllib.request.urlretrieve(face_url, face_p)
            pathlib.Path(audio_p).write_bytes(base64.b64decode(audio_b64))

            # Wav2Lip : image fixe + voix → vidéo lèvres synchronisées (venv dédié).
            cmd = [
                WAV2LIP_PY, "inference.py",
                "--checkpoint_path", WAV2LIP_CKPT,
                "--face", face_p,
                "--audio", audio_p,
                "--outfile", out_p,
                "--pads", "0", "10", "0", "0",
                "--nosmooth",
            ]
            r = subprocess.run(cmd, cwd=WAV2LIP_DIR, capture_output=True, text=True, timeout=300)
            if r.returncode != 0 or not pathlib.Path(out_p).exists():
                raise HTTPException(status_code=500, detail=f"wav2lip_failed: {r.stderr[-400:]}")

            # ré-encode H.264 + faststart (lecture mobile fiable)
            final = os.path.join(work, "lea_h264.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-i", out_p, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", "-c:a", "aac", final],
                capture_output=True, timeout=120,
            )
            data = pathlib.Path(final if pathlib.Path(final).exists() else out_p).read_bytes()
            return JSONResponse({"ok": True, "b64": base64.b64encode(data).decode(), "format": "mp4"})
        finally:
            for p in (face_p, audio_p, out_p):
                try: os.unlink(p)
                except Exception: pass

    return avatar
