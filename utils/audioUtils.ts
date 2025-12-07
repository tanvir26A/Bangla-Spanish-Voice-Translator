import { Blob } from '@google/genai';

export const float32To16BitPCM = (float32Arr: Float32Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(float32Arr.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Arr.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Arr[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export const downsampleBuffer = (
  buffer: Float32Array, 
  inputSampleRate: number, 
  outputSampleRate: number
): Float32Array => {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }
  if (inputSampleRate < outputSampleRate) {
    // Upsampling is not supported/needed for this use case
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    // Linear interpolation for better quality than nearest neighbor
    const nextOriginalIndex = (i + 1) * sampleRateRatio;
    const originalIndex = i * sampleRateRatio;
    
    // Simple decimation (taking the nearest sample)
    // For speech recognition, this is often sufficient and faster
    const index = Math.round(originalIndex);
    if (index < buffer.length) {
      result[i] = buffer[index];
    }
  }
  
  return result;
};

export const createPcmBlob = (data: Float32Array, sampleRate: number): Blob => {
  const pcmBuffer = float32To16BitPCM(data);
  const base64 = arrayBufferToBase64(pcmBuffer);
  return {
    data: base64,
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
};

export const decodeAudioData = async (
  base64Data: string,
  ctx: AudioContext,
  sampleRate: number = 24000
): Promise<AudioBuffer> => {
  const arrayBuffer = base64ToArrayBuffer(base64Data);
  const dataInt16 = new Int16Array(arrayBuffer);
  const float32Data = new Float32Array(dataInt16.length);
  
  for (let i = 0; i < dataInt16.length; i++) {
    float32Data[i] = dataInt16[i] / 32768.0;
  }

  const audioBuffer = ctx.createBuffer(1, float32Data.length, sampleRate);
  audioBuffer.getChannelData(0).set(float32Data);
  return audioBuffer;
};