import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface Pcm16WavAudio {
  sampleRate: number;
  channels: number;
  samples: Int16Array;
}

export interface WavRmsAnalysis {
  sampleRate: number;
  channels: number;
  bitsPerSample: 16;
  sampleCount: number;
  durationMs: number;
  rmsDbfs: number;
  peakDbfs: number;
}

export interface WavNormalizationInput {
  inputPath: string;
  outputPath: string;
}

export interface WavNormalizationResult {
  inputPath: string;
  outputPath: string;
  inputSampleRate: number;
  inputChannels: number;
  outputSampleRate: 16000;
  outputChannels: 1;
  inputDurationMs: number;
  outputDurationMs: number;
  outputSampleCount: number;
}

const targetSampleRate = 16_000;
const silenceDbfsFloor = -120;

export async function normalizeWavPcm16ToMono16k(input: WavNormalizationInput): Promise<WavNormalizationResult> {
  const source = parseWavPcm16(await readFile(input.inputPath));
  const sourceFrames = source.samples.length / source.channels;
  const mono = toMonoFloat32(source);
  const output = resampleMono(mono, source.sampleRate, targetSampleRate);
  await mkdir(dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, writePcm16Wav({
    sampleRate: targetSampleRate,
    channels: 1,
    samples: floatToInt16(output),
  }));
  return {
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    inputSampleRate: source.sampleRate,
    inputChannels: source.channels,
    outputSampleRate: targetSampleRate,
    outputChannels: 1,
    inputDurationMs: Math.round((sourceFrames / source.sampleRate) * 1000),
    outputDurationMs: Math.round((output.length / targetSampleRate) * 1000),
    outputSampleCount: output.length,
  };
}

export async function analyzeWavPcm16Rms(audioPath: string): Promise<WavRmsAnalysis> {
  const audio = parseWavPcm16(await readFile(audioPath));
  const sampleCount = audio.samples.length;
  let sumSquares = 0;
  let peak = 0;
  for (const rawSample of audio.samples) {
    const sample = rawSample / 32768;
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  const frameCount = sampleCount / audio.channels;
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    bitsPerSample: 16,
    sampleCount,
    durationMs: Math.round((frameCount / audio.sampleRate) * 1000),
    rmsDbfs: amplitudeToDbfs(rms),
    peakDbfs: amplitudeToDbfs(peak),
  };
}

export function parseWavPcm16(buffer: Buffer): Pcm16WavAudio {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("STT audio normalization currently requires RIFF/WAVE PCM audio.");
  }

  let fmt:
    | {
        audioFormat: number;
        channels: number;
        sampleRate: number;
        bitsPerSample: number;
      }
    | undefined;
  let dataStart = -1;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + size;
    if (chunkEnd > buffer.length) throw new Error("STT WAV file has an invalid chunk size.");
    if (id === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (id === "data") {
      dataStart = chunkStart;
      dataBytes = size;
      break;
    }
    offset = chunkEnd + (size % 2);
  }

  if (!fmt) throw new Error("STT WAV file is missing a fmt chunk.");
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error("STT audio normalization currently supports 16-bit PCM WAV audio.");
  }
  if (fmt.channels <= 0 || fmt.sampleRate <= 0) throw new Error("STT WAV file has invalid audio metadata.");
  if (dataStart < 0 || dataBytes <= 0) throw new Error("STT WAV file is missing audio data.");

  const sampleCount = Math.floor(dataBytes / 2);
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = buffer.readInt16LE(dataStart + index * 2);
  }
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    samples,
  };
}

export function writePcm16Wav(audio: Pcm16WavAudio): Buffer {
  if (audio.channels <= 0 || audio.sampleRate <= 0) throw new Error("Cannot write WAV with invalid audio metadata.");
  const bitsPerSample = 16;
  const dataBytes = audio.samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(audio.channels, 22);
  buffer.writeUInt32LE(audio.sampleRate, 24);
  buffer.writeUInt32LE(audio.sampleRate * audio.channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(audio.channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < audio.samples.length; index += 1) {
    buffer.writeInt16LE(audio.samples[index] ?? 0, 44 + index * 2);
  }
  return buffer;
}

function toMonoFloat32(audio: Pcm16WavAudio): Float32Array {
  const frames = Math.floor(audio.samples.length / audio.channels);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < audio.channels; channel += 1) {
      total += (audio.samples[frame * audio.channels + channel] ?? 0) / 32768;
    }
    mono[frame] = total / audio.channels;
  }
  return mono;
}

function resampleMono(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  if (inputSampleRate === outputSampleRate) return input;
  const outputLength = Math.max(1, Math.round((input.length * outputSampleRate) / inputSampleRate));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = (index * inputSampleRate) / outputSampleRate;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(input.length - 1, leftIndex + 1);
    const fraction = sourcePosition - leftIndex;
    const left = input[Math.min(input.length - 1, leftIndex)] ?? 0;
    const right = input[rightIndex] ?? left;
    output[index] = left + (right - left) * fraction;
  }
  return output;
}

function floatToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = Math.round(sample * 32767);
  }
  return output;
}

function amplitudeToDbfs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return silenceDbfsFloor;
  return Math.max(silenceDbfsFloor, Math.round(20 * Math.log10(value) * 1000) / 1000);
}
