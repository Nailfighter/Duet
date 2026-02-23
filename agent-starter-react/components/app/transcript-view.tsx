'use client';

import { useEffect, useRef, useState } from 'react';

interface Audiobook {
  id: string;
  title: string;
  author: string;
  cover_image: string;
  audio_file: string;
  duration: number;
  transcript_file?: string;
}

interface TranscriptViewProps {
  currentTime: number;
  audiobook: Audiobook | null;
}

interface CaptionLine {
  text: string;
  startTime: number;
  endTime: number;
}

export function TranscriptView({ currentTime, audiobook }: TranscriptViewProps) {
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);

  // Timing offset to compensate for any delay (in seconds)
  const TIMING_OFFSET = 2.0; // Positive means audio is ahead of transcript

  // Parse VTT timestamp to seconds
  const parseVTTTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]);
      const minutes = parseFloat(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  };

  // Load and parse VTT captions
  useEffect(() => {
    if (audiobook?.transcript_file) {
      fetch(`/captions/${audiobook.transcript_file}`)
        .then((res) => res.text())
        .then((vttText) => {
          const allCues: CaptionLine[] = [];
          const vttLines = vttText.split('\n');

          let i = 0;
          while (i < vttLines.length) {
            const line = vttLines[i].trim();

            // Look for timestamp lines (format: 00:00:04.160 --> 00:00:05.910)
            if (line.includes('-->')) {
              const [startStr, endStr] = line.split('-->').map(s => s.trim().split(' ')[0]);
              const startTime = parseVTTTimestamp(startStr);
              const endTime = parseVTTTimestamp(endStr);

              // Get the text content (next non-empty lines until blank line)
              i++;
              let text = '';
              while (i < vttLines.length && vttLines[i].trim() !== '') {
                const textLine = vttLines[i].trim();
                // Remove word-level timing tags like <00:00:04.640>
                const cleanedText = textLine.replace(/<[^>]+>/g, '').replace(/<c>/g, '').replace(/<\/c>/g, '');
                if (cleanedText && !cleanedText.startsWith('align:')) {
                  text += (text ? ' ' : '') + cleanedText;
                }
                i++;
              }

              if (text) {
                allCues.push({ text, startTime, endTime });
              }
            }
            i++;
          }

          // Very aggressive deduplication: skip anything that's contained in previous lines
          const filteredLines: CaptionLine[] = [];
          const recentTexts: string[] = [];
          const WINDOW_SIZE = 3; // Look at last 3 lines

          for (const cue of allCues) {
            // Skip if this text is contained in any recent line OR contains any recent line
            const isRedundant = recentTexts.some(recent =>
              cue.text.includes(recent) || recent.includes(cue.text)
            );

            if (!isRedundant) {
              filteredLines.push(cue);
              recentTexts.push(cue.text);

              // Keep window small
              if (recentTexts.length > WINDOW_SIZE) {
                recentTexts.shift();
              }
            }
          }

          setLines(filteredLines);
          console.log('Loaded filtered VTT lines:', filteredLines.length, 'from', allCues.length, 'total cues');
        })
        .catch((error) => console.error('Error loading VTT captions:', error));
    }
  }, [audiobook]);

  // Update current line based on playback time
  useEffect(() => {
    if (lines.length === 0) return;

    // Apply timing offset
    const adjustedTime = currentTime + TIMING_OFFSET;

    // Find exact match first
    let index = lines.findIndex(
      (line) => adjustedTime >= line.startTime && adjustedTime < line.endTime
    );

    // If no exact match, find the closest line before current time
    if (index === -1) {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (adjustedTime >= lines[i].startTime) {
          index = i;
          break;
        }
      }
    }

    // Fallback to first line if still no match
    if (index === -1) {
      index = 0;
    }

    if (index !== currentLineIndex) {
      setCurrentLineIndex(index);
    }
  }, [currentTime, lines, currentLineIndex]);

  // Auto-scroll to current line
  useEffect(() => {
    if (currentLineRef.current && containerRef.current) {
      currentLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLineIndex]);

  if (!audiobook) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="eink-box px-8 py-4 font-mono text-sm text-foreground">LOADING TRANSCRIPT...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col border-l-2 border-r-2 border-foreground bg-background">
      {/* Header */}
      <div className="eink-box border-l-0 border-r-0 border-t-0 px-6 py-6 relative">
        <div className="absolute top-2 left-2 flex gap-2">
          <div className="w-2 h-2 bg-accent-yellow"></div>
          <div className="w-2 h-2 bg-accent-pink"></div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground font-sans tracking-wider">
            TRANSCRIPT
          </h2>

          {/* Live Badge */}
          <div className="flex items-center gap-3">
            <div className="border-2 border-foreground px-3 py-1 text-xs font-sans font-bold tracking-wide relative bg-accent-pink">
              <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-accent-yellow animate-pulse"></div>
              <span className="text-foreground">LIVE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transcript Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-8 py-6 space-y-3 scrollbar-hide"
      >
        {lines.length === 0 ? (
          <div className="text-center text-muted-foreground font-sans text-sm">
            No transcript available
          </div>
        ) : (
          lines.map((line, index) => {
            const isCurrent = index === currentLineIndex;

            return (
              <div
                key={index}
                ref={isCurrent ? currentLineRef : null}
                className={`font-sans leading-relaxed transition-all duration-150 ${
                  isCurrent
                    ? 'text-foreground text-xl font-bold'
                    : 'text-muted-foreground text-sm font-normal'
                }`}
              >
                {line.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
