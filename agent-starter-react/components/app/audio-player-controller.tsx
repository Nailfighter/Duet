'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from '@phosphor-icons/react';
import { useSessionContext } from '@livekit/components-react';
import { cn } from '@/lib/utils';

interface Audiobook {
  id: string;
  title: string;
  author: string;
  cover_image: string;
  audio_file: string;
  duration: number;
  transcript_file?: string;
}

interface AudioPlayerControllerProps {
  onTimeUpdate?: (time: number) => void;
  onAudiobookChange?: (audiobook: Audiobook | null) => void;
}

export function AudioPlayerController({ onTimeUpdate, onAudiobookChange }: AudioPlayerControllerProps) {
  const session = useSessionContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [audiobook, setAudiobook] = useState<Audiobook | null>(null);
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch audiobook data
  useEffect(() => {
    fetch('/audiobooks.json')
      .then((res) => res.json())
      .then((data: Audiobook[]) => {
        setAudiobooks(data);
        if (data.length > 0) {
          const savedIndex = localStorage.getItem('selectedAudiobookIndex');
          const shouldAutoplay = localStorage.getItem('autoplayAudiobook');
          const bookIndex = savedIndex ? parseInt(savedIndex, 10) : 0;

          console.log('[AudioPlayer] Loading audiobook index:', bookIndex, 'from localStorage:', savedIndex);

          setCurrentIndex(bookIndex);
          const book = data[bookIndex] || data[0];
          setAudiobook(book);
          console.log('[AudioPlayer] Set audiobook to:', book.title);
          onAudiobookChange?.(book);

          if (book.duration) {
            setDuration(book.duration);
          }

          // Notify agent about initial audiobook selection (if not the first one)
          if (bookIndex !== 0 && session.room?.localParticipant) {
            const encoder = new TextEncoder();
            const message = {
              type: 'audiobook_changed',
              index: bookIndex,
              audiobook_id: book.id,
            };
            const msgData = encoder.encode(JSON.stringify(message));
            session.room.localParticipant.publishData(msgData, { reliable: true });
            console.log('[AudioPlayer] Notified agent of initial audiobook:', book.id);
          }

          // Clear localStorage after a delay to handle React Strict Mode double-mount
          setTimeout(() => {
            localStorage.removeItem('selectedAudiobookIndex');
          }, 100);

          if (shouldAutoplay === 'true') {
            localStorage.removeItem('autoplayAudiobook');
            setTimeout(() => {
              if (audioRef.current) {
                audioRef.current.play()
                  .then(() => setIsPlaying(true))
                  .catch(err => console.error('Error autoplaying:', err));
              }
            }, 500);
          }
        }
      })
      .catch((error) => console.error('Error loading audiobook data:', error));
  }, []);

  // Notify parent of audiobook changes
  useEffect(() => {
    onAudiobookChange?.(audiobook);
  }, [audiobook, onAudiobookChange]);

  // Apply volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Listen for data channel messages from agent
  useEffect(() => {
    if (!session.room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      const decoder = new TextDecoder();
      const message = decoder.decode(payload);

      try {
        const data = JSON.parse(message);

        if (data.action === 'pause_audiobook') {
          setVolume(0.2);
          if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        } else if (data.action === 'resume_audiobook') {
          clearResumeTimer();
          resumeTimerRef.current = setTimeout(() => {
            setVolume(1.0);
            if (audioRef.current) {
              audioRef.current.play();
              setIsPlaying(true);
            }
          }, 2500);
        } else if (data.action === 'seek' && typeof data.time === 'number') {
          if (audioRef.current) {
            audioRef.current.currentTime = data.time;
          }
        } else if (data.action === 'set_speed' && typeof data.speed === 'number') {
          const newSpeed = Math.max(0.25, Math.min(2.0, data.speed));
          setPlaybackSpeed(newSpeed);
          if (audioRef.current) {
            audioRef.current.playbackRate = newSpeed;
          }
        } else if (data.action === 'next_audiobook') {
          nextAudiobook();
        } else if (data.action === 'previous_audiobook') {
          previousAudiobook();
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    };

    session.room.on('dataReceived', handleDataReceived);

    return () => {
      session.room?.off('dataReceived', handleDataReceived);
    };
  }, [session.room, isPlaying]);

  const clearResumeTimer = () => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };

  // Send playback state to agent
  useEffect(() => {
    if (!session.room || !session.isConnected) return;

    const sendPlaybackState = () => {
      const encoder = new TextEncoder();
      const state = {
        type: 'playback_state',
        status: isPlaying ? 'playing' : 'paused',
        current_time: currentTime,
        duration: duration,
        playback_speed: playbackSpeed,
      };
      const data = encoder.encode(JSON.stringify(state));
      session.room?.localParticipant?.publishData(data, { reliable: true });
    };

    const interval = setInterval(sendPlaybackState, 1000);
    sendPlaybackState();

    return () => clearInterval(interval);
  }, [session.room, session.isConnected, isPlaying, currentTime, duration, playbackSpeed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    };
    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('ended', handleEnded);

    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      clearResumeTimer();
    };
  }, [audiobook, onTimeUpdate]);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const nextAudiobook = () => {
    if (audiobooks.length === 0) return;
    const wasPlaying = isPlaying;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);

    const nextIdx = (currentIndex + 1) % audiobooks.length;
    setCurrentIndex(nextIdx);
    const nextBook = audiobooks[nextIdx];
    setAudiobook(nextBook);
    onAudiobookChange?.(nextBook);
    setCurrentTime(0);
    if (nextBook.duration) {
      setDuration(nextBook.duration);
    }

    if (session.room?.localParticipant) {
      const encoder = new TextEncoder();
      const message = {
        type: 'audiobook_changed',
        index: nextIdx,
        audiobook_id: nextBook.id,
      };
      const data = encoder.encode(JSON.stringify(message));
      session.room.localParticipant.publishData(data, { reliable: true });
    }

    if (audioRef.current && wasPlaying) {
      const handleCanPlay = () => {
        audioRef.current?.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error('[AudioPlayer] Error playing next audiobook:', err));
        audioRef.current?.removeEventListener('canplay', handleCanPlay);
      };
      audioRef.current.addEventListener('canplay', handleCanPlay);
    }
  };

  const previousAudiobook = () => {
    if (audiobooks.length === 0) return;
    const wasPlaying = isPlaying;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);

    const prevIdx = (currentIndex - 1 + audiobooks.length) % audiobooks.length;
    setCurrentIndex(prevIdx);
    const prevBook = audiobooks[prevIdx];
    setAudiobook(prevBook);
    onAudiobookChange?.(prevBook);
    setCurrentTime(0);
    if (prevBook.duration) {
      setDuration(prevBook.duration);
    }

    if (session.room?.localParticipant) {
      const encoder = new TextEncoder();
      const message = {
        type: 'audiobook_changed',
        index: prevIdx,
        audiobook_id: prevBook.id,
      };
      const data = encoder.encode(JSON.stringify(message));
      session.room.localParticipant.publishData(data, { reliable: true });
    }

    if (audioRef.current && wasPlaying) {
      const handleCanPlay = () => {
        audioRef.current?.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error('[AudioPlayer] Error playing previous audiobook:', err));
        audioRef.current?.removeEventListener('canplay', handleCanPlay);
      };
      audioRef.current.addEventListener('canplay', handleCanPlay);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const changePlaybackSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 1.75, 2.0];
    const currentIdx = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!audiobook) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="eink-box px-8 py-4 font-mono text-sm text-foreground">LOADING...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background p-8 w-full">
      <div className="flex flex-col h-full w-full justify-between">
        {/* Book Cover */}
        <div className="eink-box p-4 relative">
          <div className="absolute top-2 left-2 w-2 h-2 bg-accent-purple"></div>
          <div className="absolute top-2 right-2 w-2 h-2 bg-accent-blue"></div>

          <div className="aspect-square w-full border-2 border-foreground relative">
            <img
              src={audiobook.cover_image}
              alt={audiobook.title}
              className="h-full w-full object-cover"
            />
            {isPlaying && (
              <div className="absolute bottom-2 right-2 w-3 h-3 bg-accent-green animate-pulse"></div>
            )}
          </div>
        </div>

        {/* Book Info */}
        <div className="eink-box p-4 mt-4 text-center relative">
          <div className="absolute top-2 right-2 w-2 h-2 bg-accent-pink"></div>
          <h2 className="font-bold font-sans text-lg tracking-wide text-foreground">
            {audiobook.title.toUpperCase()}
          </h2>
          <p className="text-xs font-sans text-muted-foreground mt-1">
            {audiobook.author.toUpperCase()}
          </p>

          {/* Playback Status Badge */}
          <div className="mt-3 flex justify-center">
            <div
              className={cn(
                'border-2 border-foreground px-3 py-1 text-xs font-sans font-bold tracking-wide relative',
                isPlaying ? 'bg-accent-green' : 'bg-accent-yellow'
              )}
            >
              {isPlaying && (
                <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-accent-blue animate-pulse"></div>
              )}
              <span className="text-foreground">
                {isPlaying ? 'PLAYING' : 'PAUSED'}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 space-y-2">
          <div className="relative h-2 eink-box">
            <div
              className="absolute left-0 top-0 h-full bg-foreground transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute left-0 top-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="flex justify-between font-mono text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Player Controls */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={previousAudiobook}
            className="eink-button p-3 relative bg-accent-purple hover:bg-accent-pink"
          >
            <SkipBack size={20} weight="fill" />
          </button>

          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 30);
              }
            }}
            className="eink-button p-3 font-mono text-xs font-bold relative bg-accent-blue hover:bg-accent-green"
          >
            -30
          </button>

          <button
            onClick={togglePlayPause}
            className={cn(
              "eink-button p-4 relative",
              isPlaying ? "bg-accent-green hover:bg-accent-blue" : "bg-accent-yellow hover:bg-accent-pink"
            )}
          >
            {isPlaying ? <Pause size={28} weight="fill" /> : <Play size={28} weight="fill" />}
          </button>

          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.min(
                  duration,
                  audioRef.current.currentTime + 30
                );
              }
            }}
            className="eink-button p-3 font-mono text-xs font-bold relative bg-accent-blue hover:bg-accent-green"
          >
            +30
          </button>

          <button
            onClick={nextAudiobook}
            className="eink-button p-3 relative bg-accent-purple hover:bg-accent-pink"
          >
            <SkipForward size={20} weight="fill" />
          </button>
        </div>

        {/* Playback Speed */}
        <div className="flex justify-center mt-4">
          <button
            onClick={changePlaybackSpeed}
            className="eink-button px-6 py-2 font-sans text-sm font-bold relative bg-accent-pink hover:bg-accent-purple"
          >
            <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-accent-yellow"></div>
            <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-accent-blue"></div>
            {playbackSpeed}x SPEED
          </button>
        </div>

        {/* Hidden Audio Element */}
        <audio ref={audioRef} src={audiobook.audio_file} />
      </div>
    </div>
  );
}
