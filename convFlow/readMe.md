## Usage Instructions

In one terminal, first run the following command:
docker run --rm -it -p 7890:7880 -p 7891:7881 -p 7892:7882/udp livekit/livekit-server --dev --bind 0.0.0.0 --node-ip 127.0.0.1

In a new terminal, run this command from the root directory of the project:
uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Wait for uvicorn to display "Application startup complete."

Open index.html via LiveServer and click Connect. Start chatting.
