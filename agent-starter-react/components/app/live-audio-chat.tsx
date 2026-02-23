'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useSessionContext,
  useSessionMessages,
  useVoiceAssistant,
} from '@livekit/components-react';
import { Microphone, MicrophoneSlash, ProhibitInset } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/livekit/scroll-area/scroll-area';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

export function LiveAudioChat() {
  const session = useSessionContext();
  const { messages: livekitMessages } = useSessionMessages(session);
  const { state: agentState } = useVoiceAssistant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isAIDisabled, setIsAIDisabled] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Convert LiveKit messages to our message format
  useEffect(() => {
    const convertedMessages: Message[] = livekitMessages.map((msg, index) => ({
      id: `${msg.timestamp}-${index}`,
      text: msg.message || '',
      sender: msg.from?.isLocal ? 'user' : 'agent',
      timestamp: new Date(msg.timestamp),
    }));
    setMessages(convertedMessages);

    // Auto-scroll to bottom
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [livekitMessages]);

  const handleMicToggle = async () => {
    if (session.room?.localParticipant) {
      const newMutedState = !isMicMuted;
      await session.room.localParticipant.setMicrophoneEnabled(!newMutedState);
      setIsMicMuted(newMutedState);
    }
  };

  const handleAIToggle = () => {
    const newAIDisabled = !isAIDisabled;
    setIsAIDisabled(newAIDisabled);

    if (session.room?.localParticipant) {
      if (newAIDisabled) {
        // Mute microphone when AI is disabled to prevent input
        session.room.localParticipant.setMicrophoneEnabled(false);
        setIsMicMuted(true);
      } else {
        // Re-enable microphone when AI is re-enabled
        session.room.localParticipant.setMicrophoneEnabled(true);
        setIsMicMuted(false);
      }
    }
  };

  const getAgentStatusText = () => {
    switch (agentState) {
      case 'listening':
        return 'LISTENING';
      case 'thinking':
        return 'THINKING';
      case 'speaking':
        return 'SPEAKING';
      default:
        return 'IDLE';
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-l-2 border-foreground bg-background">
      {/* Header */}
      <div className="eink-box border-l-0 border-t-0 border-r-0 px-6 py-6 relative">
        {/* Pixel decorations */}
        <div className="absolute top-2 right-2 flex gap-2">
          <div className="w-2 h-2 bg-accent-green"></div>
          <div className="w-2 h-2 bg-accent-blue"></div>
          <div className="w-2 h-2 bg-accent-purple"></div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground font-sans tracking-wider">
              AGENT CONVERSATION
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <div
                className={cn(
                  'border-2 border-foreground px-3 py-1 text-xs font-sans font-bold tracking-wide relative',
                  agentState === 'listening' && 'bg-accent-green',
                  agentState === 'thinking' && 'bg-accent-yellow',
                  agentState === 'speaking' && 'bg-accent-blue',
                  agentState === 'idle' && 'bg-background'
                )}
              >
                {agentState === 'listening' && (
                  <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-accent-purple"></div>
                )}
                {agentState === 'thinking' && (
                  <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-accent-pink animate-pulse"></div>
                )}
                {agentState === 'speaking' && (
                  <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-accent-yellow animate-pulse"></div>
                )}
                <span className="text-foreground">
                  {getAgentStatusText()}
                </span>
              </div>
              <div
                className={cn(
                  'border-2 border-foreground px-3 py-1 text-xs font-sans font-bold tracking-wide relative',
                  session.isConnected ? 'bg-accent-purple' : 'bg-background'
                )}
              >
                {session.isConnected && (
                  <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-accent-green animate-pulse"></div>
                )}
                <span className="text-foreground">
                  {session.isConnected ? 'CONNECTED' : 'OFFLINE'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 py-4">
        {!session.isConnected && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="eink-box-dashed p-12 mb-6">
              <div className="w-14 h-14 mx-auto bg-foreground"></div>
            </div>
            <h3 className="mb-3 text-lg font-bold text-foreground font-mono tracking-wider">
              WAITING FOR CONNECTION
            </h3>
            <p className="mb-6 max-w-sm text-xs text-muted-foreground font-mono leading-relaxed">
              The AI companion will connect automatically when ready. Use the microphone button to
              speak with your AI reading companion.
            </p>
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-4">
            {messages.map((message, idx) => {
              const isUser = message.sender === 'user';

              // Alternate corner pixel colors for variety
              const cornerColors = ['bg-accent-pink', 'bg-accent-yellow', 'bg-accent-green'];
              const cornerColor = cornerColors[idx % cornerColors.length];

              return (
                <div
                  key={message.id}
                  className={cn(
                    'flex flex-col',
                    isUser ? 'items-end' : 'items-start'
                  )}
                >
                  <div className="mb-1 text-xs font-sans font-bold tracking-wide text-muted-foreground flex items-center gap-2">
                    <div className={cn('w-2 h-2', isUser ? 'bg-accent-blue' : 'bg-accent-purple')}></div>
                    {isUser ? 'YOU' : 'AI'}
                  </div>
                  <div
                    className={cn(
                      'max-w-[85%] border-2 border-foreground p-4 relative',
                      isUser ? 'bg-accent-blue' : 'bg-accent-purple'
                    )}
                  >
                    {/* Corner pixel */}
                    <div className={cn(
                      'absolute top-1 w-1.5 h-1.5',
                      isUser ? 'right-1' : 'left-1',
                      cornerColor
                    )}></div>

                    <p className="text-sm font-sans leading-relaxed text-foreground">
                      {message.text}
                    </p>
                    <p className="mt-2 text-xs font-sans text-foreground opacity-60">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Agent Thinking Indicator */}
        {agentState === 'thinking' && (
          <div className="flex flex-col items-start mt-4">
            <div className="mb-1 text-xs font-mono font-bold tracking-wide text-muted-foreground">
              AI
            </div>
            <div className="eink-box-dashed px-4 py-3">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-foreground animate-pulse" />
                <div
                  className="w-2 h-2 bg-foreground animate-pulse"
                  style={{ animationDelay: '0.2s' }}
                />
                <div
                  className="w-2 h-2 bg-foreground animate-pulse"
                  style={{ animationDelay: '0.4s' }}
                />
              </div>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Audio Visualizer */}
      {session.isConnected && (agentState === 'speaking' || agentState === 'listening') && (
        <div className="eink-box border-l-0 border-r-0 px-6 py-4">
          <div className="flex items-end justify-center gap-1 h-12">
            {[...Array(16)].map((_, i) => (
              <div
                key={i}
                className="bg-foreground w-1"
                style={{
                  height: isMicMuted ? '10%' : `${Math.random() * 100}%`,
                  animationName: isMicMuted ? 'none' : 'pulse',
                  animationDuration: `${0.5 + Math.random() * 0.5}s`,
                  animationTimingFunction: 'ease-in-out',
                  animationIterationCount: 'infinite',
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div className="eink-box border-l-0 border-r-0 border-b-0 px-6 py-6">
        <div className="flex items-center justify-center gap-4">
          {/* Microphone Toggle */}
          <button
            onClick={handleMicToggle}
            disabled={!session.isConnected || isAIDisabled}
            className={cn(
              'eink-button p-4 transition-all relative',
              (!session.isConnected || isAIDisabled) && 'opacity-30 cursor-not-allowed',
              isMicMuted && session.isConnected && !isAIDisabled && 'bg-accent-yellow',
              !isMicMuted && session.isConnected && !isAIDisabled && 'bg-accent-green hover:bg-accent-blue'
            )}
          >
            {isMicMuted ? (
              <MicrophoneSlash size={24} weight="fill" />
            ) : (
              <Microphone size={24} weight="fill" />
            )}
          </button>

          {/* Stop AI Button */}
          <button
            onClick={handleAIToggle}
            disabled={!session.isConnected}
            className={cn(
              'eink-button p-4 transition-all relative',
              !session.isConnected && 'opacity-30 cursor-not-allowed',
              isAIDisabled && session.isConnected && 'bg-accent-pink',
              !isAIDisabled && session.isConnected && 'bg-accent-purple hover:bg-accent-blue'
            )}
          >
            <ProhibitInset size={24} weight="fill" />
          </button>
        </div>

        {/* Helper Text */}
        <div className="eink-divider-dashed mt-6 mb-3" />
        <p className="text-center text-xs text-muted-foreground font-mono">
          {!session.isConnected
            ? 'WAITING FOR CONNECTION'
            : isAIDisabled
            ? 'AI DISABLED - PRESS STOP TO ENABLE'
            : 'SPEAK NATURALLY'}
        </p>
      </div>
    </div>
  );
}
