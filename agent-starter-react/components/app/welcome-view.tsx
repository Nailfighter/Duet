'use client';

import { useState, useEffect } from 'react';

interface Audiobook {
  id: string;
  title: string;
  author: string;
  cover_image: string;
  audio_file: string;
  duration: number;
}

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
  onAudiobookSelect?: (index: number) => void;
}

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  onAudiobookSelect,
  ref,
}: React.ComponentProps<'div'> & WelcomeViewProps) => {
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    fetch('/audiobooks.json')
      .then((res) => res.json())
      .then((data: Audiobook[]) => {
        setAudiobooks(data);
      })
      .catch((error) => console.error('Error loading audiobook data:', error));
  }, []);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    onAudiobookSelect?.(index);
  };

  const handleStart = () => {
    // Store the selected audiobook index in localStorage so the audio player can use it
    localStorage.setItem('selectedAudiobookIndex', selectedIndex.toString());
    localStorage.setItem('autoplayAudiobook', 'true');
    console.log('[WelcomeView] Starting with audiobook index:', selectedIndex);
    onStartCall();
  };

  return (
    <div ref={ref} className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-4xl w-full space-y-12">
        {/* Pixel decorations top */}
        <div className="flex justify-center gap-4 mb-8">
          <div className="w-3 h-3 bg-accent-blue"></div>
          <div className="w-3 h-3 bg-accent-purple"></div>
          <div className="w-3 h-3 bg-accent-pink"></div>
          <div className="w-3 h-3 bg-accent-green"></div>
          <div className="w-3 h-3 bg-accent-yellow"></div>
        </div>

        {/* Header */}
        <div className="text-center space-y-6">
          <div className="relative inline-block">
            {/* Pixel corner decorations */}
            <div className="absolute -top-3 -left-3 w-3 h-3 bg-accent-blue"></div>
            <div className="absolute -top-3 -right-3 w-3 h-3 bg-accent-purple"></div>
            <div className="absolute -bottom-3 -left-3 w-3 h-3 bg-accent-green"></div>
            <div className="absolute -bottom-3 -right-3 w-3 h-3 bg-accent-pink"></div>

            <h1 className="text-4xl font-bold text-foreground font-display px-8 py-4 border-4 border-foreground bg-background uppercase">
              Duet
            </h1>
          </div>

          {/* Decorative pixel line */}
          <div className="flex justify-center gap-2">
            <div className="w-2 h-2 bg-accent-yellow"></div>
            <div className="w-2 h-2 bg-accent-blue"></div>
            <div className="w-2 h-2 bg-accent-purple"></div>
            <div className="w-2 h-2 bg-accent-pink"></div>
            <div className="w-2 h-2 bg-accent-green"></div>
          </div>

          <p className="text-lg text-muted-foreground font-sans tracking-wide">
            INTELLIGENT COMPANION FOR AUDIOBOOKS
          </p>
        </div>

        {/* Audiobook Grid */}
        <div className="space-y-8">
          {/* Decorative pixel divider */}
          <div className="flex justify-center items-center gap-3">
            <div className="w-2 h-2 bg-accent-blue"></div>
            <div className="w-2 h-2 bg-accent-purple"></div>
            <h2 className="text-xl font-bold text-foreground font-sans text-center tracking-wide px-4">
              SELECT YOUR AUDIOBOOK
            </h2>
            <div className="w-2 h-2 bg-accent-pink"></div>
            <div className="w-2 h-2 bg-accent-green"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {audiobooks.map((book, index) => {
              const colorClasses = [
                { bg: 'bg-accent-blue', text: 'text-accent-blue' },
                { bg: 'bg-accent-purple', text: 'text-accent-purple' },
                { bg: 'bg-accent-pink', text: 'text-accent-pink' },
                { bg: 'bg-accent-green', text: 'text-accent-green' },
              ];
              const accentColor = colorClasses[index % colorClasses.length];
              const isSelected = selectedIndex === index;

              return (
                <button
                  key={book.id}
                  onClick={() => handleSelect(index)}
                  className={`border-2 border-foreground p-6 text-left transition-all relative ${
                    isSelected ? 'bg-foreground' : 'bg-background hover:bg-muted'
                  }`}
                >
                  {/* Pixel accent corner */}
                  <div className={`absolute top-2 right-2 w-2 h-2 ${accentColor.bg}`}></div>

                  <div className="flex gap-4">
                    <div className={`w-24 h-24 border-2 ${isSelected ? 'border-background' : 'border-foreground'} flex-shrink-0 relative`}>
                      <img
                        src={book.cover_image}
                        alt={book.title}
                        className="w-full h-full object-cover"
                      />
                      {/* Pixel overlay */}
                      <div className={`absolute bottom-0 left-0 w-2 h-2 ${accentColor.bg}`}></div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <h3
                        className={`font-bold font-sans text-sm tracking-wide ${
                          isSelected ? 'text-background' : 'text-foreground'
                        }`}
                      >
                        {book.title.toUpperCase()}
                      </h3>
                      <p
                        className={`text-xs font-sans ${
                          isSelected ? 'text-background opacity-80' : 'text-muted-foreground'
                        }`}
                      >
                        BY {book.author.toUpperCase()}
                      </p>
                      <p
                        className={`text-xs font-sans ${
                          isSelected ? 'text-background opacity-80' : 'text-muted-foreground'
                        }`}
                      >
                        {Math.floor(book.duration / 60)}M {book.duration % 60}S
                      </p>
                    </div>
                    {isSelected && (
                      <div className="flex items-center">
                        <div className={`w-6 h-6 border-2 border-background ${accentColor.bg} flex items-center justify-center`}>
                          <div className="w-3 h-3 bg-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Start Button */}
        <div className="flex justify-center pt-8">
          <div className="flex flex-col items-center gap-6">
            {/* Decorative pixel line above */}
            <div className="flex gap-2">
              <div className="w-2 h-2 bg-accent-blue"></div>
              <div className="w-2 h-2 bg-accent-purple"></div>
              <div className="w-2 h-2 bg-accent-pink"></div>
            </div>

            <div className="relative">
              {/* Pixel corner decorations */}
              <div className="absolute -top-2 -left-2 w-3 h-3 bg-accent-blue"></div>
              <div className="absolute -top-2 -right-2 w-3 h-3 bg-accent-purple"></div>
              <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-accent-green"></div>
              <div className="absolute -bottom-2 -right-2 w-3 h-3 bg-accent-pink"></div>

              <button
                onClick={handleStart}
                className="border-4 border-foreground bg-background hover:bg-foreground hover:text-background px-16 py-4 font-sans font-bold text-lg tracking-widest transition-all active:translate-y-1"
              >
                {startButtonText.toUpperCase()}
              </button>
            </div>

            {/* Pixel decorations bottom */}
            <div className="flex gap-2">
              <div className="w-2 h-2 bg-accent-yellow"></div>
              <div className="w-2 h-2 bg-accent-green"></div>
              <div className="w-2 h-2 bg-accent-blue"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
