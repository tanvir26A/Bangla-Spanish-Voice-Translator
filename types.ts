export interface AudioConfig {
  sampleRate: number;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface TranscriptionItem {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
  isComplete: boolean;
}

// Helper type for audio processing
export interface AudioWorkletMessage {
  type: 'AUDIO_DATA';
  data: Float32Array;
}
