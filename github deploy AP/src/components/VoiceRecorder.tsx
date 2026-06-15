import React, { useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { VoiceMessageService } from '../services/voiceMessageService';

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, duration: number) => void;
  onCancel: () => void;
  theme: 'light' | 'dark' | 'glow';
}

export default function VoiceRecorder({ onRecorded, onCancel, theme }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const serviceRef = useRef(new VoiceMessageService());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    try {
      await serviceRef.current.startRecording();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      alert('Microphone access denied');
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    try {
      const { blob, duration: dur } = await serviceRef.current.stopRecording();
      onRecorded(blob, dur);
    } catch (err) {
      console.error('Recording failed:', err);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const bgClass = theme === 'glow' ? 'bg-emerald-900/40 border-emerald-500/30' :
    theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${bgClass}`}>
      {!recording ? (
        <button onClick={startRecording} className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors">
          <Mic className="w-5 h-5" />
        </button>
      ) : (
        <button onClick={stopRecording} className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white animate-pulse">
          <Square className="w-4 h-4 fill-current" />
        </button>
      )}
      <div className="flex-1">
        <p className="text-sm font-bold">{recording ? 'Recording...' : 'Tap to record voice message'}</p>
        {recording && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 bg-red-500/30 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full animate-pulse" style={{ width: `${Math.min(100, duration * 2)}%` }} />
            </div>
            <span className="text-xs font-mono">{formatTime(duration)}</span>
          </div>
        )}
      </div>
      <button onClick={onCancel} className="opacity-40 hover:opacity-100"><X className="w-4 h-4" /></button>
    </div>
  );
}
