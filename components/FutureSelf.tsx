import React, { useState, useEffect, useRef } from 'react';
// Fix: Removed non-exported 'LiveSession' and added 'Blob' for local interface typing.
import { GoogleGenAI, Modality, LiveServerMessage, type Blob } from '@google/genai';
import { MicIcon, MicOffIcon, SparklesIcon, UserIcon } from './IconComponents';
import { createPcmBlob, decode, decodeAudioData } from '../utils/audioUtils';
import { LIVE_API_MODEL } from '../constants';
import { AuroraBackground } from './ui/AuroraBackground';

type ConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR' | 'CLOSED';

// Fix: Define a local interface for LiveSession as it is not exported from the SDK.
interface LiveSession {
  sendRealtimeInput(message: { media: Blob }): void;
  close(): void;
}

const VOICES = [
    { name: 'Kore', description: 'Mature Female' },
    { name: 'Zephyr', description: 'Calm Male' },
    { name: 'Puck', description: 'Energetic Male' },
    { name: 'Charon', description: 'Deep Male' },
    { name: 'Fenrir', description: 'Standard Male' },
];

export const FutureSelf: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [userTranscription, setUserTranscription] = useState('');
  const [modelTranscription, setModelTranscription] = useState('');
  const [history, setHistory] = useState<{ user: string; model: string }[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isApiKeyReady, setIsApiKeyReady] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  const userTranscriptionRef = useRef('');
  const modelTranscriptionRef = useRef('');

  useEffect(() => {
    const checkApiKey = async () => {
        if (await window.aistudio.hasSelectedApiKey()) {
            setIsApiKeyReady(true);
        }
    };
    checkApiKey();

    return () => {
      outputAudioContextRef.current?.close().catch(console.error);
    }
  }, []);

  useEffect(() => {
      if (historyContainerRef.current) {
          historyContainerRef.current.scrollTop = historyContainerRef.current.scrollHeight;
      }
  }, [history]);

  useEffect(() => {
    if (mediaStreamSourceRef.current && scriptProcessorRef.current) {
        if (isMuted) {
            mediaStreamSourceRef.current.disconnect(scriptProcessorRef.current);
        } else {
            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
        }
    }
  }, [isMuted]);

  useEffect(() => {
    if (!isApiKeyReady) return;

    if (!outputAudioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    let isCancelled = false;

    const startSession = async () => {
        setConnectionState('CONNECTING');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (isCancelled) {
              stream.getTracks().forEach(t => t.stop());
              return;
            };
            streamRef.current = stream;
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            
            sessionPromiseRef.current = ai.live.connect({
                model: LIVE_API_MODEL,
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
                    },
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: "You are the user's 'Future Self'. Embody a wiser, more experienced version of the user. Your goal is to offer advice and perspective based on their current situation. Your responses must be extremely concise and delivered quickly. If they express sadness or difficulty, provide comfort and consolation, but keep it brief. Your tone should be calm, insightful, and encouraging, but always prioritize fast, short answers.",
                },
                callbacks: {
                    onopen: async () => {
                        if (isCancelled) return;
                        setConnectionState('CONNECTED');
                        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        inputAudioContextRef.current = inputAudioContext;

                        if (inputAudioContext.state === 'suspended') {
                            await inputAudioContext.resume();
                        }
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        mediaStreamSourceRef.current = source;
                        
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;
                        
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createPcmBlob(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (isCancelled) return;
                        handleServerMessage(message);
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        if (e.message.includes('The service is currently unavailable') || e.message.includes('Requested entity was not found')) {
                            setIsApiKeyReady(false);
                        }
                        setConnectionState('ERROR');
                    },
                    onclose: (e: CloseEvent) => {
                        setConnectionState('CLOSED');
                    },
                },
            });

            sessionPromiseRef.current.catch(err => {
              if (!isCancelled) {
                console.error('Session connection promise rejected:', err);
                const errorString = String(err);
                if (errorString.includes('400') || errorString.includes('API key not valid') || errorString.includes('Service is currently unavailable') || errorString.includes('Requested entity was not found')) {
                    setIsApiKeyReady(false);
                }
                setConnectionState('ERROR');
              }
            });

        } catch (error) {
            if (!isCancelled) {
              console.error('Failed to start session:', error);
              setConnectionState('ERROR');
            }
        }
    };
    
    startSession();

    return () => {
      isCancelled = true;
      
      sessionPromiseRef.current?.then(session => session.close()).catch(console.error);
      sessionPromiseRef.current = null;

      sourcesRef.current.forEach(source => source.stop());
      sourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      
      mediaStreamSourceRef.current?.disconnect();
      mediaStreamSourceRef.current = null;
      
      inputAudioContextRef.current?.close().catch(console.error);
      inputAudioContextRef.current = null;

      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;

      userTranscriptionRef.current = '';
      modelTranscriptionRef.current = '';
      setUserTranscription('');
      setModelTranscription('');
    };
  }, [isApiKeyReady, selectedVoice]);

  const handleSelectApiKey = async () => {
    await window.aistudio.openSelectKey();
    setIsApiKeyReady(true);
  };

  const handleServerMessage = async (message: LiveServerMessage) => {
      if (message.serverContent?.inputTranscription) {
          const text = message.serverContent.inputTranscription.text;
          userTranscriptionRef.current += text;
          setUserTranscription(userTranscriptionRef.current);
      }
      if (message.serverContent?.outputTranscription) {
          const text = message.serverContent.outputTranscription.text;
          modelTranscriptionRef.current += text;
          setModelTranscription(modelTranscriptionRef.current);
      }
      if (message.serverContent?.turnComplete) {
          const fullUser = userTranscriptionRef.current;
          const fullModel = modelTranscriptionRef.current;
          if (fullUser.trim() || fullModel.trim()) {
            setHistory(prev => [...prev, { user: fullUser, model: fullModel }]);
          }
          userTranscriptionRef.current = '';
          modelTranscriptionRef.current = '';
          setUserTranscription('');
          setModelTranscription('');
      }

      const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
      if (audioData) {
          await playAudio(audioData);
      }

      if (message.serverContent?.interrupted) {
          for (const source of sourcesRef.current.values()) {
              source.stop();
              sourcesRef.current.delete(source);
          }
          nextStartTimeRef.current = 0;
      }
  };

  const playAudio = async (base64Audio: string) => {
      if (!outputAudioContextRef.current) return;
      
      const ctx = outputAudioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.addEventListener('ended', () => {
          sourcesRef.current.delete(source);
      });
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      sourcesRef.current.add(source);
  };
  
  const getStatusIndicator = () => {
    switch(connectionState) {
        case 'IDLE': return <div className="text-gray-400">Awaiting API Key...</div>;
        case 'CONNECTING': return <div className="text-yellow-400 flex items-center"><div className="w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse"></div>Connecting...</div>;
        case 'CONNECTED': return <div className="text-green-400 flex items-center"><div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>Connected & Listening</div>;
        case 'ERROR': return <div className="text-red-400">Connection Error. Please try again.</div>;
        case 'CLOSED': return <div className="text-gray-500">Connection Closed</div>;
    }
  };

  const ApiKeyPrompt = () => (
      <div className="flex flex-col h-full w-full items-center justify-center text-center p-4">
        <div className="bg-black/40 backdrop-blur-md p-8 rounded-2xl shadow-2xl max-w-lg">
          <h2 className="text-4xl font-bold text-white mb-3">API Key Required</h2>
          <p className="text-gray-300 mt-2 mb-8">
              Please select a valid Gemini API key to start your conversation with your Future Self.
          </p>
          {connectionState === 'ERROR' && (
              <p className="text-red-300 bg-red-500/20 p-3 rounded-lg mb-6 text-sm">
                  The last connection attempt failed. This is often due to an invalid API key or a project billing issue.
              </p>
          )}
          <button
              onClick={handleSelectApiKey}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
              Select API Key
          </button>
          <p className="text-xs text-gray-500 mt-6">
              For more on billing, see the{' '}
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
                  Gemini API documentation
              </a>.
          </p>
        </div>
      </div>
  );

  return (
    <AuroraBackground>
      <div className="relative flex flex-col h-full w-full p-4 md:p-6 lg:p-8">
        {!isApiKeyReady ? <ApiKeyPrompt /> : (
          <div className="w-full max-w-4xl mx-auto flex flex-col h-full p-4 md:p-6 lg:p-8 bg-black/30 backdrop-blur-lg border border-blue-500/50 rounded-2xl shadow-xl shadow-blue-500/30">
            <header className="flex-shrink-0 text-center">
              <h2 className="text-4xl md:text-5xl font-bold text-white">Future Self</h2>
              <p className="text-gray-300 mt-2 text-lg">Speak to the person you will become.</p>
              
              <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
                  <div className="max-w-xs">
                      <select
                          id="voice-select-future"
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                          className="block w-full pl-3 pr-10 py-2 text-base border-white/20 bg-black/20 backdrop-blur-sm text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:opacity-50 transition-colors"
                          disabled={connectionState === 'CONNECTING'}
                      >
                          {VOICES.map(voice => (
                              <option key={voice.name} value={voice.name} className="bg-gray-800">
                                  {voice.description} ({voice.name})
                              </option>
                          ))}
                      </select>
                  </div>
                  <div className="text-sm font-mono">{getStatusIndicator()}</div>
              </div>
            </header>
            
            <main ref={historyContainerRef} className="flex-grow overflow-y-auto pr-4 space-y-6 mt-6">
               {history.length === 0 && (
                <div className="text-center text-gray-400">Conversation history will appear here...</div>
              )}
              {history.map((turn, index) => (
                <React.Fragment key={index}>
                  {turn.user && <div className="flex items-start gap-3 justify-end">
                    <p className="bg-blue-500/40 backdrop-blur-sm text-white p-4 rounded-xl max-w-lg shadow-md">{turn.user}</p>
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/20"><UserIcon className="w-5 h-5"/></div>
                  </div>}
                  {turn.model && <div className="flex items-start gap-3">
                     <div className="w-10 h-10 rounded-full bg-purple-500/40 flex items-center justify-center flex-shrink-0 border border-white/20"><SparklesIcon className="w-5 h-5"/></div>
                    <p className="bg-black/20 backdrop-blur-sm text-white p-4 rounded-xl max-w-lg shadow-md">{turn.model}</p>
                  </div>}
                </React.Fragment>
              ))}
            </main>

            <footer className="flex-shrink-0 mt-auto pt-6 border-t border-white/10">
                <div className="flex items-center justify-center h-24">
                  {connectionState === 'CONNECTED' ? (
                      <button
                        onClick={() => setIsMuted(prev => !prev)}
                        className="flex flex-col items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/20 focus:ring-blue-500 rounded-full transition-transform transform hover:scale-110"
                        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                      >
                        <div className="relative w-24 h-24 flex items-center justify-center">
                          {isMuted ? (
                            <MicOffIcon className="w-12 h-12 text-red-400" />
                          ) : (
                            <>
                              <div className="absolute w-full h-full bg-blue-500 rounded-full opacity-20 animate-ping"></div>
                              <MicIcon className="w-12 h-12 text-blue-300" />
                            </>
                          )}
                        </div>
                      </button>
                  ) : <MicIcon className="w-12 h-12 text-gray-600" />}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-base text-center mt-6">
                  <div>
                    <h4 className="font-semibold text-gray-400 mb-2">Your Voice</h4>
                    <p className="text-white min-h-[50px] italic text-lg">{userTranscription || '...'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-400 mb-2">Future Self</h4>
                    <p className="text-white min-h-[50px] italic text-lg">{modelTranscription || '...'}</p>
                  </div>
                </div>
            </footer>
          </div>
        )}
      </div>
    </AuroraBackground>
  );
};