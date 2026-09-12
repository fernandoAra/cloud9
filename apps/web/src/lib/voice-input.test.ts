import assert from "node:assert/strict";
import { test } from "node:test";
import { startRecognition } from "./voice-input";

test("microphone recognition starts with no arguments", () => {
  let args: unknown[] | undefined;
  startRecognition({
    start(...received: unknown[]) { args = received; },
  });
  assert.deepEqual(args, []);
});

test("Meet recognition receives only the captured audio track", () => {
  const track = { kind: "audio" } as MediaStreamTrack;
  let args: unknown[] | undefined;
  startRecognition({
    start(...received: unknown[]) { args = received; },
  }, track);
  assert.deepEqual(args, [track]);
});
