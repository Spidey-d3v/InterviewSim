# Voice Evaluation Module (`Voice_Evaluation_PRJ3/`)

This document describes the **voice evaluation subsystem**, how it works end‑to‑end, and how the current code is organized. It is based on:

- `voice_evaluation_wav2vec.py`
- `src/model/voice_wav2vec_model.py`
- `src/dataset/voice_wav_dataset.py`
- `src/training/train_voice_wav2vec.py`
- `src/training/validate_voice_wav2vec.py`
- `src/model/voice_modelcopy.py`
- `src/training/train_voice_rankercopy.py`
- `src/training/validate_voice_rankercopy.py`
- `requirements.txt`

---

## 1) What this module does

The Voice Evaluation module provides:

- **A wav2vec‑based speaking‑skills regressor** that outputs a scalar score per audio sample.
- **A dataset loader** for score‑labeled audio files.
- **Training and validation scripts** for the wav2vec model.
- **An older ranking model path** (`voice_modelcopy.py`) and its training/validation scripts.
- **An interactive CLI analysis script** that can run single or comparative scoring, record audio, and plot results.

The core output of the current model is a **single numeric “speaking_skills” score** per audio clip.

---

## 2) High‑level architecture

### Current primary model (wav2vec regression)

- **Model:** `VoiceWav2VecModel` in `src/model/voice_wav2vec_model.py`
- **Base encoder:** `facebook/wav2vec2-base` from `transformers`
- **Output:** scalar score + embedding

### Data flow (training and inference)

1. **Audio input** (WAV, 16 kHz, mono)
2. **Padding or trimming** to a fixed 15s window
3. **Wav2Vec2 embedding**
4. **Regressor head** → score

### CLI analysis

`voice_evaluation_wav2vec.py` provides a user‑interactive analysis script:

- Single input or 1 vs 2 comparison
- File input or live recording via `sounddevice`
- Optional ffmpeg conversion to 16 kHz mono WAV
- Sliding‑window score visualization
- Energy and pitch proxy analysis plots

---

## 3) Current vs older/legacy paths

### Current path (wav2vec regression)

- `VoiceWav2VecModel` + `VoiceWavDataset`
- `train_voice_wav2vec.py` / `validate_voice_wav2vec.py`
- Checkpoint: `voice_wav2vec_model.pt`

### Older path (ranking model)

There is a separate model architecture that appears to be an older/experimental ranking approach:

- Model: `VoiceRankingModel` in `src/model/voice_modelcopy.py`
- Training/validation: `train_voice_rankercopy.py` and `validate_voice_rankercopy.py`

This code expects datasets/features not present in this folder:

- `src.dataset.voice_cached_dataset` and `src.dataset.voice_dataset2` are imported,
  but those files are **not present** in this workspace. That suggests the ranking
  path is incomplete here or depends on external files not committed.

---

## 4) File‑level breakdown

### `voice_evaluation_wav2vec.py`

Interactive CLI evaluation/plotting script.

Key steps:

- Loads `voice_wav2vec_model.pt`
- Converts non‑WAV input to 16k mono WAV via ffmpeg
- Pads/truncates to 15 seconds
- Computes:
  - overall score
  - sliding window score curve (5s window, 2s stride)
  - energy curve (RMS)
  - pitch proxy (autocorrelation peak)
- Plots and prints output

Outputs are **visual** (matplotlib plots) plus printed score.

### `src/model/voice_wav2vec_model.py`

`VoiceWav2VecModel` structure:

- Pretrained `Wav2Vec2Model` base
- All wav2vec params frozen for stability
- Regressor: Linear → ReLU → Linear → ReLU
- Output layer to scalar

`forward()` returns:

- `score`: shape `[B]`
- `embedding`: latent representation from regressor

### `src/dataset/voice_wav_dataset.py`

Dataset expects:

- `csv_path`: CSV containing `file_name` and `speaking_skills`
- `audio_dir`: directory containing WAV files
- Audio is loaded via `soundfile`, converted to mono, padded/truncated to 15 seconds

Returns per sample:

```json
{
  "audio": <Tensor>,
  "score": <float>
}
```

### `src/training/train_voice_wav2vec.py`

- Uses `VoiceWavDataset`
- Loss: Huber (delta = 1.0)
- Optimizer: Adam (lr = 1e‑4)
- Trains for 5 epochs
- Saves `voice_wav2vec_model.pt`

**Note:** This script hardcodes an audio path:

```
C:\Users\krish\OneDrive\Desktop\Voice_Evaluation_PRJ3\data\audio
```

You will likely need to update this for your environment.

### `src/training/validate_voice_wav2vec.py`

- Loads `voice_wav2vec_model.pt`
- Runs inference across dataset
- Computes Spearman correlation with ground‑truth scores

### `src/model/voice_modelcopy.py`

Defines `VoiceRankingModel`:

- Bi‑LSTM over feature sequences
- Attention pooling
- 3 expert MLPs + routing layer
- Weighted fusion + regression head

Returns scalar score and fused embedding.

### `src/training/train_voice_rankercopy.py`

- Trains `VoiceRankingModel` on cached features
- Expects `VoiceCachedDataset` in `src.dataset.voice_cached_dataset` (missing here)
- Saves `voice_model.pt`

### `src/training/validate_voice_rankercopy.py`

- Validates `voice_model.pt`
- Uses `VoiceRankingDataset` from `src.dataset.voice_dataset2` (missing here)

---

## 5) Data and artifacts

Expected files in this folder:

- `voice_wav2vec_model.pt` — main wav2vec regression checkpoint
- `recruitview - Copy.csv` — dataset CSV with `file_name` + `speaking_skills`

Runtime artifacts (created by scripts):

- `converted_*.wav` (temporary conversions)
- `recorded_*.wav` (live recordings)
- `voice_model.pt` (ranking model checkpoint, legacy path)

---

## 6) Dependencies and libraries

From `requirements.txt` and code usage:

- **Core ML:** `torch`, `transformers`
- **Audio I/O:** `soundfile`, `sounddevice`, `scipy`
- **Plotting:** `matplotlib`
- **Utilities:** `numpy`, `tqdm`
- **Media conversion:** `ffmpeg` (via shell or `ffmpeg-python`)
- **Optional:** `openai-whisper` listed (not referenced in current code)

System requirement:

- `ffmpeg` must be installed and available in PATH for non‑WAV input conversion.

---

## 7) How the scoring works (current model)

1. **Waveform preprocessing**
   - mono channel
   - 16 kHz
   - fixed 15 seconds (pad or trim)

2. **Wav2Vec2 encoder**
   - extracts high‑level speech representations

3. **Regressor head**
   - projects the pooled wav2vec embedding

4. **Scalar output**
   - returned as the speaking‑skills score

---

## 8) Usage notes

### Run interactive analysis

From `Voice_Evaluation_PRJ3/`:

```bat
python voice_evaluation_wav2vec.py
```

### Train wav2vec regression

```bat
python src\training\train_voice_wav2vec.py
```

### Validate wav2vec regression

```bat
python src\training\validate_voice_wav2vec.py
```

> You must update the hard‑coded `audio_dir` path in the training/validation scripts
> unless your audio data is in the exact path used in the code.

---

## 9) Current integration usage in the project

The Vision backend in `Vision/vision_server.py` imports this module’s model class:

- `VoiceWav2VecModel`
- Checkpoint `Voice_Evaluation_PRJ3/voice_wav2vec_model.pt`

So this folder provides the **production voice scoring model** used during video chunk processing.
