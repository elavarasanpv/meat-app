import { createAudioPlayer, type AudioPlayer } from "expo-audio";

/** FreshCut's own little sounds for customers (small files: 38 KB + 89 KB). */
const PLACED = require("../../assets/sounds/freshcut_placed.wav");
const ARRIVED = require("../../assets/sounds/freshcut_arrived.wav");

const players: Record<"placed" | "arrived", AudioPlayer | null> = { placed: null, arrived: null };

function play(kind: "placed" | "arrived") {
  try {
    players[kind] ??= createAudioPlayer(kind === "placed" ? PLACED : ARRIVED);
    const p = players[kind]!;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    /* no audio: the screen still shows it */
  }
}

/** Soft sparkle with the "Order placed successfully!" flash. */
export const playPlaced = () => play("placed");

/** "Your parcel is here" jingle when the rider reaches the door (app open). */
export const playArrived = () => play("arrived");
