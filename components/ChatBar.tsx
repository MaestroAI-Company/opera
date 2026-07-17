import { AudioModule, useAudioStream } from "expo-audio";
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from "react-native";
import { Whisper } from "../src/services/whisper/WhisperService";
import NotificationModal from "./NotificationModal";

const nextWhiteIcon = require("../assets/icons/arrow.png");
const micIcon = require("../assets/icons/microphone.png");
const addIcon = require("../assets/icons/add.png");
const stopIcon = require("../assets/icons/stop.png");

type ChatInputBarProps = {
  onSend?: (message: string, images?: string[]) => void;
  onPlusPress?: () => void;
  onStop?: () => void;
  onTranscribe?: (wavBuffer: ArrayBuffer) => Promise<string | null>;
  placeholder?: string;
  incognito?: boolean;
  isGenerating?: boolean;
  supportsFiles?: boolean;
  canTranscribeRemotely?: boolean;
};

type SelectedFile = { uri: string; type: string; name: string };

//wav buffer builder from pcm chunks
function buildWavBuffer(pcmFloat32Chunks: ArrayBuffer[], sampleRate: number): ArrayBuffer {
  const totalSamples = pcmFloat32Chunks.reduce((n, b) => n + b.byteLength / 4, 0);
  const dataBytes = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const enc = new TextEncoder();
  const riff = enc.encode("RIFF");
  const wave = enc.encode("WAVE");
  const fmt = enc.encode("fmt ");
  const data = enc.encode("data");
  [riff, wave, fmt, data].forEach(() => { });
  view.setUint8(0, riff[0]); view.setUint8(1, riff[1]);
  view.setUint8(2, riff[2]); view.setUint8(3, riff[3]);
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint8(8, wave[0]); view.setUint8(9, wave[1]);
  view.setUint8(10, wave[2]); view.setUint8(11, wave[3]);
  view.setUint8(12, fmt[0]); view.setUint8(13, fmt[1]);
  view.setUint8(14, fmt[2]); view.setUint8(15, fmt[3]);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, data[0]); view.setUint8(37, data[1]);
  view.setUint8(38, data[2]); view.setUint8(39, data[3]);
  view.setUint32(40, dataBytes, true);
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
      const vol = Math.min(1, currentAudioVolume * 50);
      const animations = anims.map((anim, i) => {
        const targetScale = 1 + vol * (2 + Math.sin(Date.now() / 100 + i)) + (Math.random() * vol * 1.5);
        return Animated.timing(anim, {
          toValue: Math.max(1, Math.min(targetScale, 5)),
          duration: 60,
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
        <Animated.View key={i} style={[styles.voiceSquare, { transform: [{ scaleY: anim }] }]} />
      ))}
    </View>
  );
}

export default function ChatBar({
  onSend,
  onPlusPress,
  onStop,
  onTranscribe,
  placeholder = "Ask",
  incognito = false,
  isGenerating = false,
  supportsFiles = false,
  canTranscribeRemotely = false,
}: ChatInputBarProps) {
  const [text, setText] = useState("");
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", message: "" });

  const pcmChunksRef = useRef<ArrayBuffer[]>([]);
  const sampleRateRef = useRef<number>(16000);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;

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

  const isRecordingRef = useRef(false);

  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync().catch(() => { });
    Whisper.init().then((ok) => setWhisperAvailable(ok));
  }, []);

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

  const handlePressIn = () => {
    Vibration.vibrate(10);
    Animated.timing(pressAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const backgroundColor = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: incognito ? ["#565A75", "#70748E"] : ["#FF1A1A", "#FF4D4D"],
  });

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

  const stopAndTranscribe = async (): Promise<string | null> => {
    try {
      stream.stop();
      setIsRecording(false);
      const chunks = pcmChunksRef.current;
      pcmChunksRef.current = [];
      if (chunks.length === 0) return null;
      setIsTranscribing(true);
      const wavBuffer = buildWavBuffer(chunks, sampleRateRef.current);
      //delegate to parent if provided, otherwise use whisper directly
      const transcribed = onTranscribe
        ? await onTranscribe(wavBuffer)
        : await Whisper.transcribeData(wavBuffer);
      setIsTranscribing(false);
      return transcribed;
    } catch (e) {
      console.error("transcription failed:", e);
      setIsTranscribing(false);
      return null;
    }
  };

  const handlePickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3'],
        multiple: true,
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets) {
        const validFiles = [];
        let hasInvalidFile = false;

        for (const a of result.assets) {
          const isImage = a.mimeType?.startsWith('image/');
          const isAudio = a.mimeType?.startsWith('audio/') || a.name.toLowerCase().match(/\.(wav|mp3|m4a|aac|flac|ogg)$/);

          if (isImage) {
            validFiles.push({ uri: a.uri, type: 'image', name: a.name });
            continue;
          }

          if (isAudio) {
            const ext = a.name.toLowerCase().split('.').pop();
            if (ext === 'wav' || ext === 'mp3') {
              validFiles.push({ uri: a.uri, type: 'audio', name: a.name });
            } else {
              hasInvalidFile = true;
            }
          }
        }

        if (hasInvalidFile) {
          setModalConfig({ title: "Unsupported Format", message: "Only WAV and MP3 audio files are supported." });
          setModalVisible(true);
        }

        if (validFiles.length > 0) {
          setSelectedFiles(prev => [...prev, ...validFiles]);
        }
      }
    } catch (e) {
      console.error("Failed to pick files", e);
    }
  };

  const handleMicPress = () => {
    if (isRecording) {
      stream.stop();
      setIsRecording(false);
      pcmChunksRef.current = [];
    } else {
      startRecording();
    }
  };

  const handleSend = async () => {
    if (isRecording) {
      const transcribed = await stopAndTranscribe();
      if (transcribed && transcribed.length > 0) setText(transcribed);
      return;
    }
    if ((text.trim() || selectedFiles.length > 0) && onSend) {
      onSend(text.trim(), selectedFiles.map(f => f.type === 'audio' ? `${f.uri}?name=${encodeURIComponent(f.name)}` : f.uri));
      setText("");
      setSelectedFiles([]);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.pressableWrapper}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {selectedFiles.length > 0 && (
            <View style={[styles.filesContainerTop, incognito && styles.filesContainerTopIncognito]}>
              <View style={styles.fileChipsContainer}>
                {selectedFiles.map((file, i) => (
                  <View key={i} style={styles.filePreviewContainerTop}>
                    {file.type === 'image' ? (
                      <Image source={{ uri: file.uri }} style={styles.filePreviewImageTop} />
                    ) : (
                      <View style={styles.filePreviewAudioTop}>
                        <Text style={styles.filePreviewAudioTextTop} numberOfLines={1}>{file.name}</Text>
                      </View>
                    )}
                    <Pressable style={styles.removeFileBtnTop} onPress={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}>
                      <Text style={styles.removeFileBtnTextTop}>✕</Text>
                    </Pressable>
                  </View>
                ))}
                <Text style={[styles.filesAddedText, incognito && { color: '#ccc' }]}>
                  {selectedFiles.length} File{selectedFiles.length !== 1 ? 's' : ''} Added
                </Text>
              </View>
            </View>
          )}

          <Animated.View
            style={[
              styles.container,
              incognito && styles.containerIncognito,
              { backgroundColor: backgroundColor }
            ]}
          >
            {supportsFiles && (
              <Pressable onPress={handlePickFiles} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.plusButton}>
                <Image source={addIcon} style={styles.plusIcon} />
              </Pressable>
            )}

            {(whisperAvailable || canTranscribeRemotely) && !isGenerating && (
              <Pressable onPress={handleMicPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.micButton}>
                <Animated.View style={{ opacity: isRecording ? pulseAnim : 1 }}>
                  <Image source={micIcon} style={[styles.micIcon, isRecording && styles.micIconRecording]} />
                </Animated.View>
              </Pressable>
            )}

            {isRecording ? (
              <VoiceIndicator />
            ) : (
              <View style={{ flex: 1, marginLeft: 8 }}>
                <TextInput
                  style={[styles.input, { maxHeight: 100, minHeight: 24 }]}
                  value={isTranscribing ? "Transcribing..." : text}
                  onChangeText={isTranscribing ? undefined : setText}
                  placeholder={placeholder}
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  multiline={true}
                  editable={!isTranscribing}
                  onTouchStart={handlePressIn}
                  onTouchEnd={handlePressOut}
                />
              </View>
            )}

            {isGenerating ? (
              <Pressable onPress={onStop} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.sendButton}>
                <Image source={stopIcon} style={styles.sendIcon} />
              </Pressable>
            ) : (
              <Pressable onPress={handleSend} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.sendButton}>
                <Image source={nextWhiteIcon} style={styles.sendIcon} />
              </Pressable>
            )}
          </Animated.View>
        </Animated.View>
      </Pressable>
      <NotificationModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        onClose={() => setModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pressableWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  container: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
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
    shadowColor: "#565A75",
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
    color: "#fff",
    fontSize: 16,
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
  filesContainerTop: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#00000017',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 16,
    marginBottom: -16,
  },
  filesContainerTopIncognito: {
    backgroundColor: '#2A2A35',
    borderColor: '#00000030',
  },
  fileChipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  filePreviewContainerTop: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  filePreviewImageTop: {
    width: 44,
    height: 32,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#888',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  filePreviewAudioTop: {
    width: 44,
    height: 32,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#888',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  filePreviewAudioTextTop: {
    color: 'white',
    fontSize: 8,
    textAlign: 'center',
  },
  removeFileBtnTop: {
    position: 'absolute',
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeFileBtnTextTop: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  filesAddedText: {
    fontFamily: "IBMPlexMono-Medium",
    color: '#999',
    fontSize: 14,
    marginLeft: 4,
  },
});