import { useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Settings } from "../../services/settings/SettingsService";
import ButterflyCluster from "./ButterflyCluster";

const SECRET_TAPS = 5;
//max gap between two taps to stay in a streak
const TAP_GAP_MS = 600;

export default function MaestroCard() {
  const taps = useRef({ count: 0, last: 0 });

  const onPress = () => {
    const now = Date.now();
    const t = taps.current;
    t.count = now - t.last < TAP_GAP_MS ? t.count + 1 : 1;
    t.last = now;
    if (t.count < SECRET_TAPS) return;
    t.count = 0;
    Settings.set("maestroButterfly", "butterfly5");
  };

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <ButterflyCluster style={styles.butterfly} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
  },
  //same size as the home cluster
  butterfly: {
    width: 250,
    height: 250,
    alignSelf: "center",
  },
});
