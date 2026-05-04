# Lattice ML Inference & Evaluation (`README3`)

This document provides a deep dive into the two standalone Machine Learning modules in the Lattice project: **Vision** (VideoMAE-based visual confidence analysis) and **Voice_Evaluation_PRJ3** (Wav2Vec-based auditory analysis). 

These modules process the raw media chunks generated during the interview and map them to behavioral/confidence scores.

---

## 1. Vision Module (`/Vision`)

The `Vision` directory handles the real-time and offline processing of video chunks. It is designed to extract frames, run them through a Video Masked Autoencoder (VideoMAE), and produce confidence/behavioral scores.

### **Architecture & Workflow**
*   **`vision_server.py` & `vision.py`:** These act as the FastAPI and WebSocket entry points. They listen for incoming video chunks uploaded from the frontend (via `useChunkedRecorder`), save them to `data/uploads/`, and coordinate the analysis loop.
*   **`realtime_inference.py`:** The core engine for video analysis. 
    *   **Monitoring Mode:** It can monitor the `data/` directory for incoming `${session_id}_chunk*.mp4` files. Once a file is cleanly written, it processes it immediately.
    *   **Offline Mode:** It can take a full video file, chunk it dynamically (e.g., 15-second windows), and process them sequentially.

### **Model Details & Data Processing**
*   **Base Model:** Uses the `MCG-NJU/videomae-base` image processor from HuggingFace to normalize and reshape frames.
*   **Custom Predictor:** Loads a PyTorch checkpoint (`videoMAE_confidence_ranker_epoch6.pth`) sourced from an adjacent training directory (`Atempt2`).
*   **Frame Sampling:** Extracts exactly 16 uniform frames per chunk (video tensor shape: `1, C, T, H, W`).
*   **Mixed Precision:** Utilizes `torch.cuda.amp.autocast` for faster inference on available GPUs.
*   **Outputs:** Generates a real-time JSON file (`predictions.json`) containing chunk timestamps, execution times, and scalar confidence predictions.

---

## 2. Voice Evaluation Module (`/Voice_Evaluation_PRJ3`)

The `Voice_Evaluation_PRJ3` directory contains a dedicated, standalone PyTorch repository for training, validating, and running inference on candidate audio. It utilizes **Wav2Vec 2.0** to analyze vocal tonality, pacing, and acoustic features to rank candidate confidence.

### **Directory Structure & Components**
*   **`src/dataset/voice_wav_dataset.py`:** Defines the PyTorch `Dataset` class. It reads the CSV metadata, loads raw `.wav` audio files, handles padding/truncation to a fixed length, and maps them to target continuous scores for regression.
*   **`src/model/voice_wav2vec_model.py`:** A custom PyTorch `nn.Module` wrapping a pre-trained Wav2Vec 2.0 backbone. It likely adds a regression head (linear layers) to map the high-dimensional audio embeddings into a scalar confidence/performance score. (An older version is backed up in `voice_modelcopy.py`).
*   **`src/training/` (`train_voice_wav2vec.py`, `validate_voice_wav2vec.py`):** Standard ML training loops. Handles data loading, loss calculation (likely MSE/L1 for regression), backpropagation, and saving the best checkpoints.
*   **`voice_evaluation_wav2vec.py`:** The inference script used to load the trained weights (`voice_wav2vec_model.pt`) and evaluate new, unseen audio chunks in a production or testing context.

### **Dataset Usage**
*   **`recruitview - Copy.csv`:** This is the primary dataset manifest used for training the voice models.
*   **Structure:** While exact column names are hidden, in this visual/audio context, such CSVs map an `audio_filepath` (or video ID) to a set of human-annotated labels (e.g., `Confidence`, `Nervousness`, `Clarity`, `Recraitability_score`).
*   **Training Pipeline:** The dataset script parses this CSV, batches the `.wav` files corresponding to the rows, and feeds them into the training loop alongside their target truth values. The model learns the acoustic representations of a "good" vs "poor" interview answer.

---

## 3. How They Fit Together

While ConvFlow (`/convFlow`) evaluates the **semantic** content (what the candidate *said* via STT and LLM generation), these two pipelines evaluate the **behavioral** delivery (how the candidate *looked* and *sounded*).

1. The frontend pushes `chunk_1.mp4`.
2. `Vision` parses the visual frames and yields a "Visual Confidence" metric.
3. `<!-- filepath: c:\Users\krish\OneDrive\Desktop\PRJ3\Lattice\README3.md -->
# Lattice ML Inference & Evaluation (`README3`)

This document provides a deep dive into the two standalone Machine Learning modules in the Lattice project: **Vision** (VideoMAE-based visual confidence analysis) and **Voice_Evaluation_PRJ3** (Wav2Vec-based auditory analysis). 

These modules process the raw media chunks generated during the interview and map them to behavioral/confidence scores.

---

## 1. Vision Module (`/Vision`)

The `Vision` directory handles the real-time and offline processing of video chunks. It is designed to extract frames, run them through a Video Masked Autoencoder (VideoMAE), and produce confidence/behavioral scores.

### **Architecture & Workflow**
*   **`vision_server.py` & `vision.py`:** These act as the FastAPI and WebSocket entry points. They listen for incoming video chunks uploaded from the frontend (via `useChunkedRecorder`), save them to `data/uploads/`, and coordinate the analysis loop.
*   **`realtime_inference.py`:** The core engine for video analysis. 
    *   **Monitoring Mode:** It can monitor the `data/` directory for incoming `${session_id}_chunk*.mp4` files. Once a file is cleanly written, it processes it immediately.
    *   **Offline Mode:** It can take a full video file, chunk it dynamically (e.g., 15-second windows), and process them sequentially.

### **Model Details & Data Processing**
*   **Base Model:** Uses the `MCG-NJU/videomae-base` image processor from HuggingFace to normalize and reshape frames.
*   **Custom Predictor:** Loads a PyTorch checkpoint (`videoMAE_confidence_ranker_epoch6.pth`) sourced from an adjacent training directory (`Atempt2`).
*   **Frame Sampling:** Extracts exactly 16 uniform frames per chunk (video tensor shape: `1, C, T, H, W`).
*   **Mixed Precision:** Utilizes `torch.cuda.amp.autocast` for faster inference on available GPUs.
*   **Outputs:** Generates a real-time JSON file (`predictions.json`) containing chunk timestamps, execution times, and scalar confidence predictions.

---

## 2. Voice Evaluation Module (`/Voice_Evaluation_PRJ3`)

The `Voice_Evaluation_PRJ3` directory contains a dedicated, standalone PyTorch repository for training, validating, and running inference on candidate audio. It utilizes **Wav2Vec 2.0** to analyze vocal tonality, pacing, and acoustic features to rank candidate confidence.

### **Directory Structure & Components**
*   **`src/dataset/voice_wav_dataset.py`:** Defines the PyTorch `Dataset` class. It reads the CSV metadata, loads raw `.wav` audio files, handles padding/truncation to a fixed length, and maps them to target continuous scores for regression.
*   **`src/model/voice_wav2vec_model.py`:** A custom PyTorch `nn.Module` wrapping a pre-trained Wav2Vec 2.0 backbone. It likely adds a regression head (linear layers) to map the high-dimensional audio embeddings into a scalar confidence/performance score. (An older version is backed up in `voice_modelcopy.py`).
*   **`src/training/` (`train_voice_wav2vec.py`, `validate_voice_wav2vec.py`):** Standard ML training loops. Handles data loading, loss calculation (likely MSE/L1 for regression), backpropagation, and saving the best checkpoints.
*   **`voice_evaluation_wav2vec.py`:** The inference script used to load the trained weights (`voice_wav2vec_model.pt`) and evaluate new, unseen audio chunks in a production or testing context.

### **Dataset Usage**
*   **`recruitview - Copy.csv`:** This is the primary dataset manifest used for training the voice models.
*   **Structure:** While exact column names are hidden, in this visual/audio context, such CSVs map an `audio_filepath` (or video ID) to a set of human-annotated labels (e.g., `Confidence`, `Nervousness`, `Clarity`, `Recraitability_score`).
*   **Training Pipeline:** The dataset script parses this CSV, batches the `.wav` files corresponding to the rows, and feeds them into the training loop alongside their target truth values. The model learns the acoustic representations of a "good" vs "poor" interview answer.

---

## 3. How They Fit Together

While ConvFlow (`/convFlow`) evaluates the **semantic** content (what the candidate *said* via STT and LLM generation), these two pipelines evaluate the **behavioral** delivery (how the candidate *looked* and *sounded*).

1. The frontend pushes `chunk_1.mp4`.
2. `Vision` parses the visual frames and yields a "Visual Confidence" metric.
3. `Voice` extracts the audio envelope and yields a "Vocal Confidence" metric.
4. Together with ConvFlow's transcript analysis, this allows Lattice to build a holistic, multimodal rubric for the candidate's interview performance.