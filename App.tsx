import React, { useEffect, useRef } from 'react';
import { useTranslator } from './hooks/useTranslator';
import Visualizer from './components/Visualizer';
import { ConnectionState } from './types';

// Icons
const MicIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
    <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
  </svg>
);

const StopIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
  </svg>
);

const LoadingIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={`animate-spin ${className}`}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const App: React.FC = () => {
  const { 
    connectionState, 
    connect, 
    disconnect, 
    transcriptions, 
    error,
    inputAnalyser,
    outputAnalyser,
    volume
  } = useTranslator();
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcriptions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions]);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  const handleToggle = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <header className="w-full flex flex-col items-center mb-8 space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 text-center">
          Bangla / English ↔ Spanish
        </h1>
        <p className="text-slate-400 text-sm font-medium tracking-wide">
          REAL-TIME VOICE TRANSLATOR
        </p>
      </header>

      {/* Main Control Area */}
      <div className="relative w-full mb-8 flex flex-col items-center justify-center space-y-8">
        
        {/* Connection Button */}
        <div className="relative group">
          <div className={`absolute -inset-1 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200 ${isConnected ? 'animate-pulse' : ''}`}></div>
          <button
            onClick={handleToggle}
            disabled={isConnecting}
            className={`
              relative flex items-center justify-center w-24 h-24 rounded-full shadow-xl transition-all duration-300
              ${isConnected 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-600'
              }
            `}
          >
            {isConnecting ? (
              <LoadingIcon className="w-10 h-10" />
            ) : isConnected ? (
              <StopIcon className="w-10 h-10" />
            ) : (
              <MicIcon className="w-10 h-10" />
            )}
          </button>
        </div>

        {/* Status Text */}
        <div className="h-6">
          {isConnecting && <span className="text-blue-400 animate-pulse">Connecting to Gemini...</span>}
          {isConnected && <span className="text-emerald-400 font-semibold tracking-wide">● LIVE SESSION ACTIVE</span>}
          {connectionState === ConnectionState.DISCONNECTED && <span className="text-slate-500">Ready to start</span>}
          {connectionState === ConnectionState.ERROR && <span className="text-red-400">Connection Error</span>}
        </div>

        {/* Visualizers */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="flex flex-col space-y-2">
              <span className="text-xs text-slate-500 uppercase font-semibold pl-2">My Voice (Input)</span>
              <Visualizer analyser={inputAnalyser} isActive={isConnected} color="#38bdf8" />
           </div>
           <div className="flex flex-col space-y-2">
              <span className="text-xs text-slate-500 uppercase font-semibold pl-2">Translator (Output)</span>
              <Visualizer analyser={outputAnalyser} isActive={isConnected} color="#34d399" />
           </div>
        </div>

      </div>

      {/* Transcription Log */}
      <div className="w-full flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 overflow-hidden flex flex-col min-h-[300px] shadow-inner">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Conversation Log</h2>
          <span className="text-xs text-slate-600">Transcriptions are for reference</span>
        </div>
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
          {transcriptions.length === 0 && (
            <div className="h-full flex items-center justify-center text-slate-600 text-sm italic">
              Say something in Bangla, English or Spanish...
            </div>
          )}
          
          {transcriptions.map((item) => (
            <div 
              key={item.id} 
              className={`flex w-full ${item.isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`
                  max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed
                  ${item.isUser 
                    ? 'bg-blue-600/20 text-blue-100 rounded-tr-sm border border-blue-500/20' 
                    : 'bg-emerald-600/20 text-emerald-100 rounded-tl-sm border border-emerald-500/20'
                  }
                `}
              >
                <div className="text-[10px] opacity-50 mb-1 uppercase font-bold tracking-wider">
                  {item.isUser ? 'You' : 'Translator'}
                </div>
                {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-900/90 text-red-100 px-6 py-3 rounded-full shadow-xl border border-red-700 backdrop-blur-md animate-bounce">
          {error}
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center text-slate-600 text-xs max-w-md mx-auto leading-relaxed">
        <p>Powered by Google Gemini 2.5 Flash Native Audio Preview.</p>
        <p>Speak naturally. The AI will auto-detect your language and reply in the other.</p>
      </div>

    </div>
  );
};

export default App;