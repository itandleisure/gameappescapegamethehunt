import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

let player: AudioPlayer | null = null;
let ready: Promise<void> | null = null;

function load(): Promise<void> {
  ready ??= setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' })
    .catch(() => undefined)
    .then(() => {
      player = createAudioPlayer(require('../../assets/sirene.wav'));
    });
  return ready;
}

/** Sirene van 3 seconden bij een popup (nieuwe opdracht of bericht), met een tril erbij. */
export async function playSiren(): Promise<void> {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  try {
    await load();
    if (!player) return;
    await player.seekTo(0);
    player.play();
  } catch {
    // Geen geluid (bijvoorbeeld in de simulator): de popup werkt gewoon.
  }
}
