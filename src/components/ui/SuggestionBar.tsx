import { ReactNode } from "react";
import { ScrollView, StyleProp, StyleSheet, ViewStyle } from "react-native";

export type SuggestionBarProps = {
  children: ReactNode;
  //replies sit right, assistant tools sit left
  align?: "left" | "right";
  style?: StyleProp<ViewStyle>;
};

//single row, scrolls sideways
export default function SuggestionBar({ children, align = "right", style }: SuggestionBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.bar, style]}
      contentContainerStyle={[styles.content, align === "right" ? styles.right : styles.left]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginTop: 8,
    //row sizes itself inside column
    flexGrow: 0,
  },
  content: {
    flexDirection: "row",
    gap: 8,
    //pills hug one edge when sparse
    flexGrow: 1,
  },
  right: {
    justifyContent: "flex-end",
  },
  left: {
    justifyContent: "flex-start",
  },
});
