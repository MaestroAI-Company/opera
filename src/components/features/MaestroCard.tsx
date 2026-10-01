import { StyleSheet } from "react-native";
import ButterflyCluster from "./ButterflyCluster";

export default function MaestroCard() {
  return <ButterflyCluster style={styles.butterfly} />;
}

const styles = StyleSheet.create({
  //same size as the home cluster
  butterfly: {
    width: 250,
    height: 250,
    alignSelf: "center",
  },
});
