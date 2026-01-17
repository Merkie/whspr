export interface RecordingResult {
  wavPath: string;
  duration: number;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
}
