'use client';

import { useState } from 'react';
import { AudioPlayerController } from '@/components/app/audio-player-controller';
import { TranscriptView } from '@/components/app/transcript-view';
import { LiveAudioChat } from '@/components/app/live-audio-chat';

interface Audiobook {
  id: string;
  title: string;
  author: string;
  cover_image: string;
  audio_file: string;
  duration: number;
  transcript_file?: string;
}

export function SplitScreenLayout() {
  const [currentTime, setCurrentTime] = useState(0);
  const [audiobook, setAudiobook] = useState<Audiobook | null>(null);

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden">
      {/* Left Third - Audio Player Controller */}
      <div className="flex h-full w-1/3 flex-shrink-0">
        <AudioPlayerController
          onTimeUpdate={setCurrentTime}
          onAudiobookChange={setAudiobook}
        />
      </div>

      {/* Middle Third - Transcript */}
      <div className="flex h-full w-1/3 flex-shrink-0">
        <TranscriptView currentTime={currentTime} audiobook={audiobook} />
      </div>

      {/* Right Third - Live Audio Chat */}
      <div className="flex h-full w-1/3 flex-shrink-0">
        <LiveAudioChat />
      </div>
    </div>
  );
}
