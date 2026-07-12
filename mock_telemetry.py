import sys
import os
import random
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from convFlow.database import SessionLocal
from convFlow.models import InterviewSession, InterviewTimeline

def main():
    db = SessionLocal()
    
    # Get last two sessions
    sessions = db.query(InterviewSession).order_by(InterviewSession.created_at.desc()).limit(2).all()
    
    if not sessions:
        print("No sessions found.")
        return
        
    for session in sessions:
        print(f"Populating mock data for session: {session.session_id}")
        
        # Clear existing telemetry if any
        db.query(InterviewTimeline).filter(InterviewTimeline.session_id == session.session_id).delete()
        
        # Add 60 seconds of data (every 3 seconds)
        for i in range(40):
            timestamp = i * 3.0
            
            # Mock SPEECH event
            is_red_speech = random.random() < 0.1
            speech_event = InterviewTimeline(
                session_id=session.session_id,
                timestamp_seconds=timestamp,
                metric_type="SPEECH",
                is_red_flag=is_red_speech,
                raw_data_json={
                    "status": "SUCCESS",
                    "label": "FLUENT" if not is_red_speech else "STUTTER",
                    "confidence": random.uniform(0.7, 0.99),
                    "is_red_flag": is_red_speech
                }
            )
            db.add(speech_event)
            
            # Mock VISION event
            is_red_vision = random.random() < 0.15
            vision_event = InterviewTimeline(
                session_id=session.session_id,
                timestamp_seconds=timestamp,
                metric_type="VISION",
                is_red_flag=is_red_vision,
                raw_data_json={
                    "emotions": {
                        "Genuine Smile": random.uniform(0.1, 0.8),
                        "Frowning / Stress": random.uniform(0.0, 0.3) if not is_red_vision else random.uniform(0.6, 0.9)
                    },
                    "is_red_flag_eye": is_red_vision,
                    "is_red_flag_emotion": False
                }
            )
            db.add(vision_event)
            
        db.commit()
    
    print("Mock telemetry data populated successfully!")
    db.close()

if __name__ == "__main__":
    main()
