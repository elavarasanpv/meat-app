import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

/**
 * FreshCut's own alert sound (the "chop & chime"), played in the app when a
 * new order (shop) or a new delivery offer (rider) arrives while the app is
 * open. With the app closed, the same sound comes from the push channel.
 */
const ORDER_SOUND = require("../../assets/sounds/freshcut_order.wav");

let player: AudioPlayer | null = null;
let ready = false;

export function playOrderAlert() {
  try {
    if (!ready) {
      ready = true;
      // Ring even when the phone is on silent? No — respect the mute switch;
      // the push channel's own settings decide that.
      setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false }).catch(() => {});
    }
    player ??= createAudioPlayer(ORDER_SOUND);
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    /* audio unavailable: the visual alert is still there */
  }
}
