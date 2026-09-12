type RecognitionStarter = {
  start(audioTrack?: MediaStreamTrack): void;
};

// Chrome rejects start(undefined): the microphone overload needs zero args.
export function startRecognition(
  recognition: RecognitionStarter,
  audioTrack?: MediaStreamTrack,
): void {
  if (audioTrack) recognition.start(audioTrack);
  else recognition.start();
}
