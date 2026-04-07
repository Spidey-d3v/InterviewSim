import os

def save_phase_transcript(phase: str, transcript: str):
    filename = f"transcript_{phase}.txt"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(transcript)