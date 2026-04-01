import { useRef, useState } from "react";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export type RecordingState = "idle" | "recording" | "transcribing";

export function useTalkItOut(sessionId: string, onTranscript: (text: string) => void) {
  const { toast } = useToast();
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const actualMime = mr.mimeType || mimeType || "audio/webm";
        const ext = actualMime.includes("mp4") ? "mp4" : actualMime.includes("ogg") ? "ogg" : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        if (audioBlob.size < 100) {
          toast({ title: "No audio captured", description: "Please try again and speak clearly.", variant: "destructive" });
          setRecordingState("idle");
          return;
        }
        setRecordingState("transcribing");
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, `recording.${ext}`);
          const res = await fetch(buildUrl(api.workflow.voiceToText.path, { sessionId }), {
            method: "POST", body: formData, credentials: "include",
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error((errBody as any).message || "Transcription failed");
          }
          const { transcript } = await res.json();
          if (transcript) {
            onTranscript(transcript);
          } else {
            toast({ title: "Nothing transcribed", description: "We didn't catch anything — try again.", variant: "destructive" });
          }
        } catch (err) {
          console.error("Transcription error:", err);
          toast({ title: "Transcription failed", description: (err as Error).message || "Please try typing instead.", variant: "destructive" });
        } finally {
          setRecordingState("idle");
        }
      };
      mr.start(250);
      setRecordingState("recording");
    } catch (err) {
      const name = (err as DOMException)?.name ?? "UnknownError";
      const msg = (err as Error)?.message ?? String(err);
      if (name === "NotFoundError") {
        toast({ title: "No microphone found", description: "No audio input device was detected.", variant: "destructive" });
      } else if (name === "NotReadableError") {
        toast({ title: "Microphone in use", description: "Another app is using the microphone. Close it and try again.", variant: "destructive" });
      } else if (name === "NotAllowedError") {
        toast({ title: "Microphone access denied", description: "Please allow microphone access in your browser.", variant: "destructive" });
      } else {
        toast({ title: `Mic error: ${name}`, description: msg, variant: "destructive" });
      }
    }
  };

  const handleStopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    mr.requestData();
    mr.stop();
    setRecordingState("transcribing");
  };

  return { recordingState, handleStartRecording, handleStopRecording };
}
