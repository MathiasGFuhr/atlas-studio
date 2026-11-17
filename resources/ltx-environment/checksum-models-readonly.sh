#!/usr/bin/env bash
set -euo pipefail
# Read-only checksum dos modelos LTX — NÃO altera/exclui safetensors.
OUT=/workspace/ltx-model-sha256.txt
: > "$OUT"
sha256sum -b "/workspace/runpod-slim/ComfyUI/models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors" | tee -a "$OUT"
sha256sum -b "/workspace/runpod-slim/ComfyUI/models/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors" | tee -a "$OUT"
sha256sum -b "/workspace/runpod-slim/ComfyUI/models/loras/gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors" | tee -a "$OUT"
sha256sum -b "/workspace/runpod-slim/ComfyUI/models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors" | tee -a "$OUT"
sha256sum -b "/workspace/runpod-slim/ComfyUI/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors" | tee -a "$OUT"
echo "DONE $(date -Is)" | tee -a "$OUT"
cat "$OUT"
