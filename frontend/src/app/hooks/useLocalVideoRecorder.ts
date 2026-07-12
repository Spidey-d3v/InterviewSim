import { useEffect, useRef } from 'react';
import { saveVideoLocal } from '../../utils/videoStorage';

export function useLocalVideoRecorder(
  stream: MediaStream | null,
  isRecording: boolean,
  sessionId: string | null
) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (isRecording && stream && sessionId) {
      // Start recording
      chunksRef.current = [];
      try {
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
        
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          console.log("Saving full interview video locally...", blob.size, "bytes");
          await saveVideoLocal(sessionId, blob);
          console.log("Local video saved successfully to IndexedDB!");
        };

        recorder.start(1000); // chunk every 1 second
        mediaRecorderRef.current = recorder;
        console.log("Started local video recording for session:", sessionId);

      } catch (err) {
        console.error("Failed to start MediaRecorder:", err);
      }
    } else if (!isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Stop recording
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording, stream, sessionId]);
}
