import os
import torch
import numpy as np
import mediapipe as mp
from collections import deque
from transformers import AutoFeatureExtractor, Wav2Vec2ForSequenceClassification

class SpeechAnalyzer:
    def __init__(self, sample_rate=16000):
        self.sample_rate = sample_rate
        # Load from project root/demos
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_path = os.path.join(base_dir, "demos", "wav2vec2_model")
        
        if not os.path.exists(model_path):
            raise Exception(f"Wav2Vec2 model not found at {model_path}")
            
        self.feature_extractor = AutoFeatureExtractor.from_pretrained(model_path)
        self.model = Wav2Vec2ForSequenceClassification.from_pretrained(model_path)
        self.model.eval()

    def process_chunk(self, audio_data: np.ndarray):
        """
        Processes a flat 1D numpy array of float32 audio samples.
        Returns a dictionary with status and raw scores.
        """
        # Threshold to ignore silence/background noise
        if np.abs(audio_data).mean() < 0.002:
            return {"status": "SILENCE", "label": "FLUENT", "confidence": 1.0, "is_red_flag": False}

        try:
            inputs = self.feature_extractor(audio_data, sampling_rate=self.sample_rate, return_tensors="pt")
            with torch.no_grad():
                logits = self.model(**inputs).logits
            probs = torch.nn.functional.softmax(logits, dim=-1)[0]
            
            results = []
            for i in range(len(probs)):
                results.append({"label": self.model.config.id2label[i], "score": probs[i].item()})
            results = sorted(results, key=lambda x: x["score"], reverse=True)
            
            top = results[0]
            stutter_label = top['label'].upper()
            confidence = top['score']
            
            is_red_flag = False
            # VERY forgiving threshold for red markings on timeline
            if stutter_label != 'FLUENT' and confidence > 0.80:
                is_red_flag = True
            else:
                stutter_label = 'FLUENT'
                
            return {
                "status": "SPEECH",
                "label": stutter_label,
                "confidence": float(confidence),
                "is_red_flag": is_red_flag,
                "raw_scores": results
            }
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}

class VisionAnalyzer:
    def __init__(self):
        BaseOptions = mp.tasks.BaseOptions
        FaceLandmarker = mp.tasks.vision.FaceLandmarker
        FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        task_path = os.path.join(base_dir, "demos", "face_landmarker.task")
        
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=task_path),
            running_mode=VisionRunningMode.IMAGE,
            output_face_blendshapes=True,
            num_faces=1
        )
        self.landmarker = FaceLandmarker.create_from_options(options)
        self.gaze_history = deque(maxlen=90) # Track 90 frames for shift logic

    def _get_eye_gaze_ratio(self, landmarks):
        left_outer = landmarks[33]
        left_inner = landmarks[133]
        left_iris = landmarks[468] 
        eye_width = left_inner.x - left_outer.x
        if eye_width == 0: return 0.5
        return (left_iris.x - left_outer.x) / eye_width

    def _get_explainable_emotions(self, blendshapes):
        b_dict = {b.category_name: b.score for b in blendshapes}
        
        emotions = {
            "Genuine Smile": (b_dict.get("mouthSmileLeft", 0) + b_dict.get("mouthSmileRight", 0) + b_dict.get("cheekPuff", 0)) / 3.0,
            "Frowning / Stress": (b_dict.get("browDownLeft", 0) + b_dict.get("browDownRight", 0)) / 2.0,
            "Surprise / Shock": (b_dict.get("browInnerUp", 0) + b_dict.get("jawOpen", 0)) / 2.0,
            "Anxious Lip Bite": (b_dict.get("mouthRollLower", 0) + b_dict.get("mouthPucker", 0)) / 2.0,
            "Suspicious Squint": (b_dict.get("eyeSquintLeft", 0) + b_dict.get("eyeSquintRight", 0)) / 2.0
        }
        
        for k in emotions:
            emotions[k] = min(1.0, float(emotions[k]) * 2.5) 
            
        sorted_emotions = sorted(emotions.items(), key=lambda item: item[1], reverse=True)
        return [{"name": e[0], "score": e[1]} for e in sorted_emotions[:3]]

    def process_frame(self, image_rgb: np.ndarray):
        """
        Process an RGB numpy array (e.g. from LiveKit VideoFrame)
        """
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        detection_result = self.landmarker.detect(mp_image)
        
        result = {
            "face_detected": False,
            "eye_status": "UNKNOWN",
            "is_red_flag_eye": False,
            "top_emotions": [],
            "gaze_direction": "Looking Away",
            "camera_engagement": 0.0
        }
        
        if detection_result.face_landmarks and detection_result.face_blendshapes:
            result["face_detected"] = True
            face_landmarks = detection_result.face_landmarks[0]
            blendshapes = detection_result.face_blendshapes[0]
            
            # Action Units
            result["top_emotions"] = self._get_explainable_emotions(blendshapes)
            
            # Gaze Darting
            gaze_ratio = self._get_eye_gaze_ratio(face_landmarks)
            self.gaze_history.append(gaze_ratio)
            
            result["eye_status"] = "CONFIDENT (Steady)"
            
            if len(self.gaze_history) > 30:
                history_list = list(self.gaze_history)
                shift_count = 0
                for i in range(1, len(history_list)):
                    if abs(history_list[i] - history_list[i-1]) > 0.12:
                        shift_count += 1
                        
                if shift_count >= 8: 
                    result["eye_status"] = "NERVOUS (Darting)"
                    result["is_red_flag_eye"] = True
            
            if gaze_ratio < 0.42:
                result["gaze_direction"] = "Looking Right"
                result["camera_engagement"] = 0.5
            elif gaze_ratio > 0.58:
                result["gaze_direction"] = "Looking Left"
                result["camera_engagement"] = 0.5
            else:
                result["gaze_direction"] = "Looking Forward"
                result["camera_engagement"] = 1.0
                    
        return result
