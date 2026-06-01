import torch
import cv2
from l2cs import Pipeline, render
import numpy as np 
from collections import deque

# config for rolling average for eye contact score 
WINDOW_SIZE = 30 
PERFECT_GAZE_THRESHOLD = 0.10 # 5 degrees
LOST_GAZE_THRESHOLD = 0.35 # 20 degrees

#THE actual rolling buffer for the socres 
score_history = deque(maxlen=WINDOW_SIZE)

def get_frame_score(yaw, pitch):
    """Calculates a 0.0 to 5.0 score for a single frame based on gaze deviation."""
    # Calculate Euclidean distance from center (0,0)
    distance = np.sqrt(yaw**2 + pitch**2)
    
    if distance <= PERFECT_GAZE_THRESHOLD:
        return 5.0
    elif distance >= LOST_GAZE_THRESHOLD:
        return 0.0
    else:
        # Linear interpolation between 5.0 and 0.0
        return 5.0 * (1 - (distance - PERFECT_GAZE_THRESHOLD) / (LOST_GAZE_THRESHOLD - PERFECT_GAZE_THRESHOLD))

gaze_pipeline = Pipeline(
    weights='models/L2CSNet_gaze360.pkl',
    arch='ResNet50',
    device=torch.device('cuda' if torch.cuda.is_available() else 'cpu')
)

cap = cv2.VideoCapture(1, cv2.CAP_DSHOW)

while True:
    ret, frame = cap.read()

    if not ret:
        print("Failed to grab frame")
        break

    try:
        results = gaze_pipeline.step(frame)

        # Only render if faces detected
        if results is not None:
            frame = render(frame, results)
            
            yaw = float(results.yaw[0])
            pitch = float(results.pitch[0]) 
            
            # calculate the score 
            frame_score = get_frame_score(yaw, pitch)
            score_history.append(frame_score) # appending the score 
            
            #calculate the avg smoothed score 
            confidence_score = sum(score_history)/len(score_history)
            
            
            
                
            cv2.putText(
                frame,
                f"Yaw: {yaw:.2f} Pitch: {pitch:.2f}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 255, 0),
                2
                )
            
            if confidence_score >= 4.0:
                color = (0, 255, 0)   # Green
            elif confidence_score >= 2.5:
                color = (0, 255, 255) # Yellow
            else:
                color = (0, 0, 255)
                
                
            cv2.putText(
                frame,
                f"Eye Contact Score: {confidence_score:.1f}/5.0",
                (20,80),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                color,
                3    
            )
            if len(results.yaw)>1:
                cv2.putText(
                    frame,
                    f"Multiple Faces Detected",
                    (20, 120),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (0, 0, 255),
                    2
                )
                print("multiple faces detected")
                
    
        else:
                # Handle scenario where no face is detected
                # For a strict system, if no face is seen, eye contact is broken (score 0)
                score_history.append(0.0)
                if len(score_history) > 0:
                    confidence_score = sum(score_history) / len(score_history)
                    cv2.putText(
                        frame,
                        f"Eye Contact Score: {confidence_score:.1f}/5.0 (No Face)",
                        (20, 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3
                    )

    except Exception as e:
        print(e)
    
        

    cv2.imshow("L2CS-Net", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()