FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required for psycopg2 and mediapipe (requires GL libraries)
RUN apt-get update && apt-get install -y libpq-dev gcc libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.docker.txt .
RUN pip install --no-cache-dir -r requirements.docker.txt

# Copy the rest of the application
COPY . .

CMD ["python", "agent.py"]
