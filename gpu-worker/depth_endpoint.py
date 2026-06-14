#!/usr/bin/env python3
"""
Talk2Me — Worker GPU : endpoint /depth (Pascal 2026-06-13).
VRAI calcul de profondeur (Depth Anything V2) sur une image caméra.
Entrée  : POST /depth { image_b64 }
Sortie  : { ok, depth_b64 (PNG niveaux de gris : clair=proche, sombre=loin), w, h }
Sert à comprendre les VOLUMES de l'espace filmé (pas une grille décorative).
À enregistrer dans worker.py via _register_depth(app, _auth) AVANT uvicorn.run.
"""
import base64, io
from fastapi import Header, HTTPException
from fastapi.responses import JSONResponse

_depth_pipe = None


def _register_depth(app, _auth):
    @app.post("/depth")
    async def depth(payload: dict, authorization: str = Header(default="")):
        _auth(authorization)
        global _depth_pipe
        b = payload.get("image_b64")
        if not b:
            raise HTTPException(status_code=400, detail="image_b64_required")
        from PIL import Image
        import numpy as np
        img = Image.open(io.BytesIO(base64.b64decode(b))).convert("RGB")
        # bornage taille (perf)
        if max(img.size) > 768:
            img.thumbnail((768, 768))
        if _depth_pipe is None:
            import os
            os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"  # pas de hf_transfer sur ce worker
            import torch
            from transformers import pipeline
            _depth_pipe = pipeline(
                "depth-estimation",
                model="depth-anything/Depth-Anything-V2-Small-hf",
                device=0 if torch.cuda.is_available() else -1,
            )
        out = _depth_pipe(img)
        d = np.array(out["depth"], dtype="float32")
        d = (d - d.min()) / (d.max() - d.min() + 1e-6)  # 0..1 (1 = proche)
        depth_img = Image.fromarray((d * 255).astype("uint8"))
        buf = io.BytesIO(); depth_img.save(buf, format="PNG")
        return JSONResponse({
            "ok": True,
            "depth_b64": base64.b64encode(buf.getvalue()).decode(),
            "w": img.width, "h": img.height,
        })
    return depth
