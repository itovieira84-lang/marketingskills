"""Transcrição local para o VYVE Content Engine (faster-whisper).

Uso: python transcribe.py <arquivo> [modelo=small] [idioma=pt]
Imprime JSON: {"language": "pt", "segments": [{"start", "end", "text", "words": [...]}]}
"""
import json
import sys

from faster_whisper import WhisperModel


def main() -> None:
    path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small"
    language = sys.argv[3] if len(sys.argv) > 3 else "pt"
    model = WhisperModel(model_name, device="auto", compute_type="int8")
    segments, info = model.transcribe(path, language=language, word_timestamps=True, vad_filter=True)
    out = {"language": info.language, "segments": []}
    for s in segments:
        out["segments"].append({
            "start": s.start,
            "end": s.end,
            "text": s.text,
            "words": [{"start": w.start, "end": w.end, "word": w.word} for w in (s.words or [])],
        })
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
