import { Image, StyleSheet } from "react-native";
import { MAESTRO_BUTTERFLIES, useMaestroButterfly } from "./maestroButterfly";

export default function MaestroCard() {
  const butterfly = MAESTRO_BUTTERFLIES[useMaestroButterfly()];

  return <Image source={butterfly.color} style={styles.butterfly} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  //same size as the home cluster
  butterfly: {
    width: 250,
    height: 250,
    alignSelf: "center",
  },
});
