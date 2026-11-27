"""Step 1: word-level transcription of video/public/audio/*.wav with faster-whisper.

Run from the repo root:
  uv run --with faster-whisper python -I video/tools/transcribe.py [model]
Writes video/tools/whisper_raw.json (consumed by build_captions.py).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel


def load16k(path):
    # decode with ffmpeg (avoids PyAV API drift): mono float32 @ 16 kHz
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le",
                          "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / "video" / "public" / "audio"
OUT = ROOT / "video" / "tools" / "whisper_raw.json"

model_name = sys.argv[1] if len(sys.argv) > 1 else "medium.en"
model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=16)

result = {"model": model_name, "clips": {}}
for i in range(14):
    path = AUDIO / f"{i:02d}.wav"
    segments, info = model.transcribe(
        load16k(path), language="en", beam_size=5, word_timestamps=True,
        vad_filter=False, condition_on_previous_text=False,
    )
    words, text = [], []
    for seg in segments:
        text.append(seg.text.strip())
        for w in seg.words:
            words.append({"text": w.word.strip(), "start": round(w.start, 3),
                          "end": round(w.end, 3), "prob": round(w.probability, 3)})
    result["clips"][f"{i:02d}"] = {"text": " ".join(text), "words": words}
    print(f"{i:02d}: {' '.join(text)}", flush=True)

OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False))
print("wrote", OUT)
