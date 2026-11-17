# syntax=docker/dockerfile:1
# Atlas Studio — ComfyUI LTX-2.3 reproduzível (Fase 4)
# DRY-RUN / SPEC VERSIONADO — NÃO fazer build/push sem autorização explícita.
# Modelos ficam no Network Volume (/runpod-volume), NÃO nesta imagem.

# Pins confirmados no inventário read-only do Pod atual (2026-11-08):
#   ComfyUI: 0.30.0
#   PyTorch: 2.10.0+cu130
#   Python:  3.12.3
#   GPU:     NVIDIA RTX PRO 4500 Blackwell (~31.4 GB VRAM)
#   CUDA toolkit/driver: PENDING nvidia-smi (torch wheel cu130)
# Workflow exportado: 55 nós, marcador LTX=true, 5/5 assets IA2V

ARG CUDA_TAG=13.0.0-runtime-ubuntu24.04
FROM nvidia/cuda:${CUDA_TAG}

ENV DEBIAN_FRONTEND=noninteractive \
    COMFY_PORT=8188 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 python3-pip python3-venv ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Python do inventário: 3.12.3 — validar se a imagem base já expõe 3.12
WORKDIR /opt

# PIN PyTorch (confirmado no Pod): 2.10.0+cu130
# Descomentar somente em build autorizado:
# RUN pip3 install --no-cache-dir torch==2.10.0 --index-url https://download.pytorch.org/whl/cu130

# PIN ComfyUI (versão reportada /system_stats): 0.30.0
# Preferir tag/commit SHA imutável correspondente a 0.30.0 (não :latest):
# RUN git clone https://github.com/comfyanonymous/ComfyUI.git /ComfyUI \
#  && cd /ComfyUI && git checkout v0.30.0 \
#  && pip3 install --no-cache-dir -r requirements.txt

# LTX-2.3: suporte nativo no ComfyUI 0.30.0 (object_info confirmou nós LTXV*/TextGenerateLTX2Prompt).
# Softlink modelos → Network Volume (anexado na criação do Pod futuro):
# RUN mkdir -p /runpod-volume/models \
#  && rm -rf /ComfyUI/models \
#  && ln -s /runpod-volume/models /ComfyUI/models

VOLUME ["/runpod-volume"]
EXPOSE 8188
WORKDIR /ComfyUI

# Verificações de inicialização (entrypoint autorizado):
# 1) python -c "import torch; assert torch.__version__.startswith('2.10')"
# 2) curl -sf localhost:8188/system_stats | grep 0.30
# 3) class_types LTX + presença dos 5 safetensors no volume
# 4) NÃO enfileirar prompt de produção sem teste LipSync aprovado

CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
