import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Animated, Easing, Modal, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { ApiError } from "@/lib/api";
import { transcribe } from "@/lib/voice";
import { useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

/** Small mono AAC clip: enough for speech, quick to upload. */
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 32000, isMeteringEnabled: true };
const MAX_MS = 8000;
const MIN_MS = 700; // shorter than this is a stray tap, not speech
const CALIBRATE_MS = 400; // first moments measure the room's background noise
const ABOVE_NOISE_DB = 10; // this much over the background counts as talking
const SPEECH_MS = 350; // need this much talking before a pause can end the clip
const SILENCE_MS = 1400; // stop this long after they stop talking
const MIN_AUTO_STOP_MS = 1800; // never auto-stop sooner than this
const BARS = 9;
const SILENT_AVG_DB = -55; // a working mic never averages this quiet over a whole clip

type Phase = "starting" | "listening" | "thinking" | "heard" | "retry" | "nomic" | "silent";

/**
 * Voice search sheet. Records until the person pauses (or taps the mic),
 * sends the clip to the API, shows what it heard, and hands back the text.
 * The mic level only drives the bars and the auto-stop; whatever was
 * recorded is always sent, so a quiet mic never blocks a search.
 */
export function VoiceSheet({ visible, onClose, onResult }: { visible: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 80);
  const [phase, setPhase] = useState<Phase>("starting");
  const [heardText, setHeardText] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  // Ask for the mic before the sheet shows: Android's permission prompt hides an open Modal.
  const [shown, setShown] = useState(false);
  const spoke = useRef(false);
  const loudMs = useRef(0);
  const noise = useRef<number[]>([]);
  const lastTick = useRef(0);
  const levels = useRef({ sum: 0, n: 0 });
  const quietSince = useRef<number | null>(null);
  const busy = useRef(false);

  const level = useRef(new Animated.Value(0)).current; // 0..1 mic level
  const pulse = useRef(new Animated.Value(0)).current; // ring around the mic
  const idle = useRef(new Animated.Value(0)).current; // gentle wave when not listening

  async function start() {
    spoke.current = false;
    loudMs.current = 0;
    noise.current = [];
    lastTick.current = 0;
    levels.current = { sum: 0, n: 0 };
    quietSince.current = null;
    busy.current = false;
    setWhy(null);
    setPhase("starting");
    const perm = await requestRecordingPermissionsAsync();
    setShown(true);
    if (!perm.granted) return setPhase("nomic");
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.selectionAsync().catch(() => {});
      setPhase("listening");
    } catch {
      setPhase("retry");
    }
  }

  async function finish() {
    if (busy.current) return;
    busy.current = true;
    const ms = state.durationMillis;
    setPhase("thinking");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (ms < MIN_MS || !recorder.uri) {
        if (__DEV__) setWhy(`[dev] clip too short (${ms} ms) or no file`);
        return setPhase("retry");
      }
      // the mic gave nothing at all (muted, blocked or broken): say so instead of sending silence
      const avg = levels.current.n ? levels.current.sum / levels.current.n : -120;
      if (avg < SILENT_AVG_DB) {
        if (__DEV__) setWhy(`[dev] mic average ${Math.round(avg)} dB`);
        return setPhase("silent");
      }
      const { text } = await transcribe(recorder.uri);
      if (!text) {
        if (__DEV__) setWhy(`[dev] ${Math.round(ms / 100) / 10}s sent, speech service heard nothing, mic avg ${Math.round(levels.current.sum / Math.max(1, levels.current.n))} dB over ${levels.current.n} readings`);
        return setPhase("retry");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setHeardText(text);
      setPhase("heard");
      // let them read what was heard, then hand it to the search
      setTimeout(() => {
        setShown(false);
        onResult(text);
      }, 700);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 503) setWhy(e.message);
      else if (__DEV__) setWhy(`[dev] ${String(e)}`);
      setPhase("retry");
    }
  }

  async function close() {
    busy.current = true;
    if (recorder.isRecording) await recorder.stop().catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setShown(false);
    onClose();
  }

  useEffect(() => {
    if (visible) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // bars follow the voice; auto-stop after a pause or at the time limit
  useEffect(() => {
    if (phase !== "listening" || !state.isRecording) return;
    const db = state.metering;
    const ms = state.durationMillis;
    if (typeof db === "number") {
      levels.current = { sum: levels.current.sum + Math.max(db, -120), n: levels.current.n + 1 };
      const step = lastTick.current ? Math.max(0, ms - lastTick.current) : 0;
      lastTick.current = ms;
      if (ms < CALIBRATE_MS) {
        noise.current.push(db);
      } else {
        // talking = clearly louder than the room, judged against its own background
        const floor = noise.current.length ? noise.current.reduce((a, b) => a + b, 0) / noise.current.length : -60;
        const loud = db > Math.max(-50, floor + ABOVE_NOISE_DB);
        if (loud) {
          loudMs.current += step;
          if (loudMs.current >= SPEECH_MS) spoke.current = true;
          quietSince.current = null;
        } else if (spoke.current && ms > MIN_AUTO_STOP_MS) {
          quietSince.current ??= Date.now();
          if (Date.now() - quietSince.current > SILENCE_MS) void finish();
        }
      }
      Animated.timing(level, { toValue: Math.max(0, Math.min(1, (db + 55) / 40)), duration: 80, useNativeDriver: true }).start();
    }
    if (state.durationMillis > MAX_MS) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.metering, state.durationMillis, state.isRecording, phase]);

  useEffect(() => {
    const ring = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    const wave = Animated.loop(Animated.timing(idle, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }));
    ring.start();
    wave.start();
    return () => {
      ring.stop();
      wave.stop();
    };
  }, [pulse, idle]);

  const listening = phase === "listening";
  const thinking = phase === "thinking" || phase === "starting";
  const title =
    phase === "heard" ? t("voiceGotIt") : phase === "thinking" ? t("voiceThinking") : phase === "retry" ? t("voiceRetryTitle") : phase === "silent" ? t("voiceSilentTitle") : phase === "nomic" ? t("voiceNoMic") : t("voiceListening");
  const sub = phase === "retry" ? why ?? t("voiceRetrySub") : phase === "silent" ? why ?? t("voiceSilentSub") : phase === "nomic" ? t("voiceNoMicSub") : phase === "heard" ? "" : t("voiceHint");

  return (
    <Modal visible={visible && shown} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: "rgba(28,23,21,0.5)", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ borderTopLeftRadius: 34, borderTopRightRadius: 34, overflow: "hidden" }}>
          <LinearGradient colors={["#FFE6D8", "#FFF6EF", "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={{ paddingTop: 12, paddingBottom: 24 + insets.bottom, paddingHorizontal: 24, alignItems: "center" }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(28,23,21,0.14)" }} />

            <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: listening ? "#E11D48" : c.muted, opacity: listening ? 1 : 0.5 }} />
                <AppText variant="label" muted>{listening ? t("voiceRec") : t("voiceSearch")}</AppText>
              </View>
              <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("close")} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(28,23,21,0.08)", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" color={c.ink} size={16} />
              </Pressable>
            </View>

            {/* voice bars */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 72, marginTop: 34 }}>
              {Array.from({ length: BARS }).map((_, i) => {
                const mid = 1 - Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2 + 0.6); // centre bars tallest
                const live = level.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.25 + 0.75 * mid] });
                const wave = idle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.18, 0.18 + (thinking ? 0.5 : 0.22) * mid, 0.18] });
                return (
                  <Animated.View
                    key={i}
                    style={{ width: 8, height: 64, borderRadius: 4, backgroundColor: phase === "heard" ? c.successText : c.primary, opacity: listening || phase === "heard" ? 0.9 : 0.45, transform: [{ scaleY: listening ? live : wave }] }}
                  />
                );
              })}
            </View>

            {phase === "heard" ? (
              <View style={{ marginTop: 22, flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: "#DDF3E6" }}>
                <Icon name="check" color={c.successText} size={16} />
                <AppText variant="bodyBold" color={c.successText} numberOfLines={2} style={{ flexShrink: 1, fontSize: 15 }}>{heardText}</AppText>
              </View>
            ) : null}

            <AppText style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: c.ink, textAlign: "center", marginTop: phase === "heard" ? 14 : 24 }}>{title}</AppText>
            {sub ? <AppText variant="caption" muted style={{ textAlign: "center", marginTop: 8, lineHeight: 18, maxWidth: 300 }}>{sub}</AppText> : null}

            {/* mic with a pulsing ring while listening */}
            <View style={{ marginTop: 30, width: 128, height: 128, alignItems: "center", justifyContent: "center" }}>
              {listening ? (
                <Animated.View
                  pointerEvents="none"
                  style={{ position: "absolute", width: 88, height: 88, borderRadius: 44, backgroundColor: c.primary, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }}
                />
              ) : null}
              <Pressable
                disabled={thinking || phase === "heard"}
                onPress={() => (listening ? void finish() : void start())}
                accessibilityRole="button"
                accessibilityLabel={listening ? t("voiceTapStop") : t("voiceTapSpeak")}
                style={({ pressed }) => ({ width: 88, height: 88, borderRadius: 44, backgroundColor: phase === "heard" ? c.successText : listening ? c.primary : c.ink, alignItems: "center", justifyContent: "center", opacity: thinking ? 0.45 : 1, transform: [{ scale: pressed ? 0.94 : 1 }], shadowColor: listening ? c.primary : "#000", shadowOpacity: listening ? 0.35 : 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 })}
              >
                {listening ? <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: "#FFFFFF" }} /> : <Icon name={phase === "heard" ? "check" : "mic"} color="#FFFFFF" size={32} />}
              </Pressable>
            </View>
            <AppText variant="label" muted numberOfLines={1} style={{ marginTop: 12, textAlign: "center" }}>
              {listening ? t("voiceTapStop") : phase === "retry" || phase === "silent" ? t("voiceTapRetry") : thinking ? " " : phase === "heard" ? " " : t("voiceTapSpeak")}
            </AppText>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
