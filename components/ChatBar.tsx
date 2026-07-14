import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useAudioStream, AudioModule } from "expo-audio";
import { Whisper } from "../src/services/whisper/WhisperService";

//icons
const nextWhiteIcon = require("../assets/icons/arrow.png");
const micIcon = require("../assets/icons/microphone.png");
const addIcon = require("../assets/icons/add.png");

const stopIcon = require("../assets/icons/stop.png");

type ChatInputBarProps = {
  onSend?: (message: string) => void;
  onPlusPress?: () => void;
  onStop?: () => void;
  placeholder?: string;
  incognito?: boolean;
  isGenerating?: boolean;
};

// build a wav file header + float32 pcm data for whisper.rn transcribedata
function buildWavBuffer(pcmFloat32Chunks: ArrayBuffer[], sampleRate: number): ArrayBuffer {
  //concat all float32 chunks
  const totalSamples = pcmFloat32Chunks.reduce((n, b) => n + b.byteLength / 4, 0);
  const dataBytes = totalSamples * 2; //16-bit output

  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  //riff header
  const enc = new TextEncoder();
  const riff = enc.encode("RIFF");
  const wave = enc.encode("WAVE");
  const fmt = enc.encode("fmt ");
  const data = enc.encode("data");

  [riff, wave, fmt, data].forEach(() => {}); //keep refs
  view.setUint8(0, riff[0]); view.setUint8(1, riff[1]);
  view.setUint8(2, riff[2]); view.setUint8(3, riff[3]);
  view.setUint32(4, 36 + dataBytes, true);     //file size - 8
  view.setUint8(8, wave[0]); view.setUint8(9, wave[1]);
  view.setUint8(10, wave[2]); view.setUint8(11, wave[3]);
  view.setUint8(12, fmt[0]); view.setUint8(13, fmt[1]);
  view.setUint8(14, fmt[2]); view.setUint8(15, fmt[3]);
  view.setUint32(16, 16, true);                //subchunk1 size
  view.setUint16(20, 1, true);                 //pcm format
  view.setUint16(22, 1, true);                 //mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);    //byte rate
  view.setUint16(32, 2, true);                 //block align
  view.setUint16(34, 16, true);                //bits per sample
  view.setUint8(36, data[0]); view.setUint8(37, data[1]);
  view.setUint8(38, data[2]); view.setUint8(39, data[3]);
  view.setUint32(40, dataBytes, true);

  //write 16-bit pcm samples
  let offset = 44;
  for (const chunk of pcmFloat32Chunks) {
    const f32 = new Float32Array(chunk);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

let currentAudioVolume = 0;

function VoiceIndicator() {
  const anims = useRef(Array.from({ length: 7 }).map(() => new Animated.Value(1))).current;

  useEffect(() => {
    let isMounted = true;
    const animate = () => {
      if (!isMounted) return;
      
      // increase multiplier to react more
      const vol = Math.min(1, currentAudioVolume * 50); 
      
      const animations = anims.map((anim, i) => {
        // scaley min = 1
        const targetScale = 1 + vol * (2 + Math.sin(Date.now() / 100 + i)) + (Math.random() * vol * 1.5);
        return Animated.timing(anim, {
          toValue: Math.max(1, Math.min(targetScale, 5)), 
          duration: 60, // faster = more reactive
          useNativeDriver: true,
        });
      });
      
      Animated.parallel(animations).start(() => {
        if (isMounted) requestAnimationFrame(animate);
      });
    };
    
    animate();

    return () => {
      isMounted = false;
      anims.forEach(a => a.stopAnimation());
    };
  }, [anims]);

  return (
    <View style={styles.voiceIndicatorContainer}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.voiceSquare,
            {
              transform: [{ scaleY: anim }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function ChatBar({
  onSend,
  onPlusPress,
  onStop,
  placeholder = "Ask",
  incognito = false,
  isGenerating = false,
}: ChatInputBarProps) {
  const [text, setText] = useState("");
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const pcmChunksRef = useRef<ArrayBuffer[]>([]);
  const sampleRateRef = useRef<number>(16000);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // audio stream 16kHz float32 mono for whisper
  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "float32",
    onBuffer: (buffer) => {
      if (isRecordingRef.current) {
        pcmChunksRef.current.push(buffer.data);
        sampleRateRef.current = buffer.sampleRate;
        
        const f32 = new Float32Array(buffer.data);
        let sum = 0;
        for (let i = 0; i < f32.length; i++) {
          sum += f32[i] * f32[i];
        }
        currentAudioVolume = Math.sqrt(sum / f32.length);
      }
    },
  });

  //ref to avoid stale closure in onBuffer callback
  const isRecordingRef = useRef(false);

  //init whisper on mount and request mic permission early
  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync().catch(() => {});
    Whisper.init().then((ok) => setWhisperAvailable(ok));
  }, []);

  //pulse animation when recording
  useEffect(() => {
    isRecordingRef.current = isRecording;
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  //start audio streaming
  const startRecording = async () => {
    try {
      pcmChunksRef.current = [];
      setIsRecording(true);
      await stream.start();
    } catch (e) {
      console.error("failed to start audio stream:", e);
      setIsRecording(false);
    }
  };

  //stop streaming and transcribe accumulated pcm
  const stopAndTranscribe = async (): Promise<string | null> => {
    try {
      stream.stop();
      setIsRecording(false);

      const chunks = pcmChunksRef.current;
      pcmChunksRef.current = [];

      if (chunks.length === 0) return null;

      setIsTranscribing(true);
      const wavBuffer = buildWavBuffer(chunks, sampleRateRef.current);
      console.log(`[Whisper] Start transcribing ${chunks.length} chunks (approx ${Math.round((chunks.length * 1024) / sampleRateRef.current)}s)...`);
      const startTime = Date.now();
      const transcribed = await Whisper.transcribeData(wavBuffer);
      console.log(`[Whisper] Transcription completed in ${Date.now() - startTime}ms: "${transcribed}"`);
      setIsTranscribing(false);
      return transcribed;
    } catch (e) {
      console.error("transcription failed:", e);
      setIsTranscribing(false);
      return null;
    }
  };

  //handle mic press — toggle recording
  const handleMicPress = () => {
    if (isRecording) {
      //cancel recording without sending
      stream.stop();
      setIsRecording(false);
      pcmChunksRef.current = [];
    } else {
      startRecording();
    }
  };

  //handle send — if recording, stop + transcribe + send
  const handleSend = async () => {
    if (isRecording) {
      const transcribed = await stopAndTranscribe();
      if (transcribed && transcribed.length > 0 && onSend) {
        onSend(transcribed);
      }
      return;
    }

    if (text.trim() && onSend) {
      onSend(text.trim());
      setText("");
    }
  };

  return (
    <View style={[styles.container, incognito && styles.containerIncognito]}>
      {/* + button */}
      <Pressable onPress={onPlusPress} style={styles.plusButton}>
        <Image source={addIcon} style={styles.plusIcon} />
      </Pressable>

      {/* mic button */}
      {whisperAvailable && !isGenerating && (
        <Pressable onPress={handleMicPress} style={styles.micButton}>
          <Animated.View style={{ opacity: isRecording ? pulseAnim : 1 }}>
            <Image
              source={micIcon}
              style={[
                styles.micIcon,
                isRecording && styles.micIconRecording,
              ]}
            />
          </Animated.View>
        </Pressable>
      )}

      {/* text input or voice indicator */}
      {isRecording ? (
        <VoiceIndicator />
      ) : (
        <TextInput
          style={[styles.input, { maxHeight: 100 }]}
          value={isTranscribing ? "Transcribing..." : text}
          onChangeText={isTranscribing ? undefined : setText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.6)"
          multiline={true}
          editable={!isTranscribing}
        />
      )}

      {/* send or stop button */}
      {isGenerating ? (
        <Pressable onPress={onStop} style={styles.sendButton}>
          <Image source={stopIcon} style={styles.sendIcon} />
        </Pressable>
      ) : (
        <Pressable onPress={handleSend} style={styles.sendButton}>
          <Image source={nextWhiteIcon} style={styles.sendIcon} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF1A1A",
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    minHeight: 56,
    maxHeight: 120,
    shadowColor: "#FF1A1A",
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 6,
  },
  containerIncognito: {
    backgroundColor: "#747474",
    shadowColor: "#747474",
  },
  plusButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  micButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  micIcon: {
    width: 18,
    height: 18,
    tintColor: "#fff",
    resizeMode: "contain",
  },
  micIconRecording: {
    tintColor: "#FFD700",
  },
  plusIcon: {
    width: 18,
    height: 18,
    tintColor: "#fff",
    resizeMode: "contain",
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 0,
  },
  voiceIndicatorContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    marginRight: 8,
    gap: 6,
  },
  voiceSquare: {
    width: 6,
    height: 6,
    backgroundColor: "#fff",
  },
  sendButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    width: 18,
    height: 18,
    tintColor: "#fff",
  },
});
