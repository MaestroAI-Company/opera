import { Image, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";

const butterfly = require("../../../assets/images/butterfly5.png");

type ProfileCardProps = {
  name: string;
};

//borderless, wrap in a group for the frame
export default function ProfileCard({ name }: ProfileCardProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const trimmed = name.trim();

  return (
    <View style={styles.card}>
      <Image source={butterfly} style={styles.butterfly} resizeMode="contain" />
      <Text style={[styles.name, !trimmed && styles.placeholder]} numberOfLines={2}>
        {trimmed || t("profileCard.placeholder")}
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    //square format leaves room for future color and texture
    card: {
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: Spacing.xl2,
      backgroundColor: Colors.background,
    },
    butterfly: {
      width: 120,
      height: 120,
      marginBottom: Spacing.lg2,
    },
    name: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.displayMd,
      lineHeight: 32,
      color: Colors.textPrimary,
      textAlign: "center",
    },
    placeholder: {
      color: Colors.textMuted,
    },
  });
