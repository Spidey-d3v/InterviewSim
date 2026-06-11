import sys
import json
from database import SessionLocal
from models import InterviewSession
from llm.feedback_generator import generate_v2_feedback

def update_last_session():
    db = SessionLocal()
    try:
        # Get the latest session
        session = db.query(InterviewSession).order_by(InterviewSession.created_at.desc()).first()
        if not session:
            print("No sessions found.")
            return

        print(f"Updating session: {session.session_id}")
        
        metrics_data = session.question_metrics_json
        
        # Handle if metrics is a dict with "version": 2
        if isinstance(metrics_data, dict) and "questions" in metrics_data:
            questions = metrics_data["questions"]
            total_chunks = session.metrics_summary.get("total_chunks", 0) if session.metrics_summary else 0
            if total_chunks == 0:
                total_chunks = sum(len(q.get("chunks", [])) for q in questions)
        elif isinstance(metrics_data, list):
            questions = metrics_data
            total_chunks = sum(len(q.get("chunks", [])) for q in questions)
        else:
            print("Invalid metrics format")
            return

        print(f"Found {len(questions)} questions, {total_chunks} total chunks")
        
        # Call the new generator
        new_v2_feedback = generate_v2_feedback(questions, len(questions), total_chunks)
        
        # Save back to DB
        session.recommendation_v2 = new_v2_feedback
        db.commit()
        
        print(f"Successfully updated recommendation_v2 for session {session.session_id}!")
        print("Updated Observations:", json.dumps(new_v2_feedback.get("observations", {}), indent=2))
        
    finally:
        db.close()

if __name__ == "__main__":
    update_last_session()
