import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, downsampleBuffer } from '../utils/audioUtils';
import { ConnectionState, TranscriptionItem } from '../types';

const API_KEY = process.env.API_KEY || '';
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const SYSTEM_INSTRUCTION = `You are a real-time voice translator.
Rules:
1. Detect automatically whether the user is speaking Bangla, Spanish, or English.
2. If input is Bangla, translate to natural Spanish.
3. If input is Spanish, translate to natural Bangla.
4. If input is English, translate to natural Spanish.
5. Only return translated audio, no written text.
6. Do NOT transcribe the original sentence.
7. Do NOT show explanations.
8. Match the tone (formal/informal) of the speaker.
9. If unsure of language, choose the closest match.
Your output MUST always be in audio format.`;

export const useTranslator = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0);

  // Audio Context Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Session Refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Helper to update transcription history safely
  const addTranscription = useCallback((text: string, isUser: boolean, isComplete: boolean) => {
    setTranscriptions(prev => {
      const last = prev[prev.length - 1];
      // If we have an incomplete transcription of the same type, update it
      if (last && last.isUser === isUser && !last.isComplete) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: last.text + text, isComplete }
        ];
      }
      // Otherwise add new item
      return [
        ...prev,
        {
          id: Date.now().toString() + Math.random().toString(),
          text,
          isUser,
          timestamp: Date.now(),
          isComplete
        }
      ];
    });
  }, []);

  const connect = async () => {
    if (!API_KEY) {
      setError("API Key is missing.");
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);

      // Initialize Audio Contexts
      // NOTE: We try to request 16000Hz, but the browser may ignore this and use the hardware rate (e.g. 48000Hz).
      // We must check ctx.sampleRate and downsample if necessary.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputContextRef.current = new AudioContextClass({ sampleRate: 24000 });

      // Analysers
      inputAnalyserRef.current = inputContextRef.current.createAnalyser();
      outputAnalyserRef.current = outputContextRef.current.createAnalyser();
      
      // Volume monitoring
      const volumeData = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
      const updateVolume = () => {
        if (inputAnalyserRef.current && connectionState === ConnectionState.CONNECTED) {
          inputAnalyserRef.current.getByteFrequencyData(volumeData);
          let sum = 0;
          for(let i = 0; i < volumeData.length; i++) sum += volumeData[i];
          setVolume(sum / volumeData.length);
          requestAnimationFrame(updateVolume);
        }
      };

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const currentInputSampleRate = inputContextRef.current.sampleRate;

      sessionPromiseRef.current = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          // Removing transcription configs to prevent 'Invalid Argument' error
          // and because we want voice-to-voice primarily.
          // inputAudioTranscription: {}, 
          // outputAudioTranscription: {} 
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            
            // Setup Audio Processing Pipeline
            if (!inputContextRef.current || !streamRef.current) return;
            
            inputSourceRef.current = inputContextRef.current.createMediaStreamSource(streamRef.current);
            inputSourceRef.current.connect(inputAnalyserRef.current!);
            
            // Use ScriptProcessor for raw audio capture
            // Buffer size 4096 gives decent latency/performance balance
            processorRef.current = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processorRef.current.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // CRITICAL: Downsample to 16000Hz if the context is running at a higher rate (e.g. 44100/48000)
              // Sending 48k data as 16k causes slow-motion audio which the model cannot understand.
              const downsampledData = downsampleBuffer(inputData, currentInputSampleRate, 16000);
              
              const pcmBlob = createPcmBlob(downsampledData, 16000);
              
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(console.error);
            };

            inputSourceRef.current.connect(processorRef.current);
            processorRef.current.connect(inputContextRef.current.destination);
            
            // Start volume monitoring
            updateVolume();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputContextRef.current) {
              try {
                const ctx = outputContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(base64Audio, ctx, 24000);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                
                // Connect to analyser for visualization, then destination
                if (outputAnalyserRef.current) {
                  source.connect(outputAnalyserRef.current);
                  outputAnalyserRef.current.connect(ctx.destination);
                } else {
                  source.connect(ctx.destination);
                }

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                
                sourcesRef.current.add(source);
                source.addEventListener('ended', () => sourcesRef.current.delete(source));
              } catch (err) {
                console.error("Error decoding audio", err);
              }
            }

            // Handle Transcriptions (if enabled in future)
            const inputTrans = message.serverContent?.inputTranscription;
            if (inputTrans) {
               addTranscription(inputTrans.text, true, true);
            }
            
            const outputTrans = message.serverContent?.outputTranscription;
            if (outputTrans) {
               addTranscription(outputTrans.text, false, true);
            }
            
            if (message.serverContent?.interrupted) {
               sourcesRef.current.forEach(source => {
                 try { source.stop(); } catch(e) {}
               });
               sourcesRef.current.clear();
               nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err) => {
            console.error("Session error:", err);
            // Don't show generic error to user immediately if it's just a closure
            // but for 'invalid argument' we want to see it.
            setError("Connection error: " + (err instanceof Error ? err.message : String(err)));
            setConnectionState(ConnectionState.ERROR);
            disconnect();
          }
        }
      });

    } catch (e: any) {
      setError(e.message || "Failed to connect.");
      setConnectionState(ConnectionState.ERROR);
    }
  };

  const disconnect = () => {
    // Close session
    if (sessionPromiseRef.current) {
       sessionPromiseRef.current.then(session => {
         try { session.close(); } catch(e) {}
       });
       sessionPromiseRef.current = null;
    }

    // Stop tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Disconnect nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }

    // Close contexts
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }

    // Stop all playing audio
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setConnectionState(ConnectionState.DISCONNECTED);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connectionState,
    connect,
    disconnect,
    transcriptions,
    error,
    inputAnalyser: inputAnalyserRef.current,
    outputAnalyser: outputAnalyserRef.current,
    volume
  };
};