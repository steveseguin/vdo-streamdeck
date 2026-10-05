"""Generates the demo voice-over, one WAV per narration line.

Uses Kokoro (Apache-2.0), a local neural TTS, so no service or key is needed:

    python -m pip install "kokoro>=0.9" soundfile
    python scripts/demo-voice.py <output-dir>

record-demo.mjs reads the WAVs from VOICE_DIR and times each scene to them.
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SAMPLE_RATE = 24000

narration = json.loads((Path(__file__).parent / "demo-narration.json").read_text(encoding="utf-8"))
out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "voice")
out_dir.mkdir(parents=True, exist_ok=True)
pipeline = KPipeline(lang_code="a")

for line in narration["lines"]:
    chunks = [audio for _, _, audio in pipeline(line.get("say", line["text"]), voice=narration["voice"], speed=narration["speed"])]
    audio = np.concatenate(chunks)
    sf.write(out_dir / f"{line['id']}.wav", audio, SAMPLE_RATE, subtype="PCM_16")
    print(f"{line['id']}: {len(audio) / SAMPLE_RATE:.2f}s")
