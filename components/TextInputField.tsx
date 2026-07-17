import { Image, ImageSourcePropType, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";

interface TextInputFieldProps extends TextInputProps {
  icon?: ImageSourcePropType;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function TextInputField({ icon, style, containerStyle, ...props }: TextInputFieldProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {icon && <Image source={icon} style={styles.icon} />}
      <TextInput
        style={[styles.input, icon ? { paddingLeft: 10 } : undefined, style]}
        placeholderTextColor="#aaa"
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#00000017",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  icon: {
    width: 18,
    height: 18,
    tintColor: "#000",
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#222",
    fontFamily: "IBMPlexMono-Medium",
    padding: 0,
  },
});
