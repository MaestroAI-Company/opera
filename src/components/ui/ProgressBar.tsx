import { Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

type ProgressBarProps = {
  progress: number;
  icon?: ImageSourcePropType;
  fillColor?: string;
};

//continuous progress track, reuses the slider's icon+track layout
export default function ProgressBar({
  progress,
  icon,
  fillColor,
}: ProgressBarProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={[styles.container, !icon && styles.containerNoIcon]}>
      {icon && <Image source={icon} style={styles.icon} />}
      <View style={styles.track}>
        {clamped > 0 && (
          <View
            style={[
              styles.fill,
              {
                //full bar also covers the right border
                right: clamped >= 1 ? -2 : `${(1 - clamped) * 100}%`,
                backgroundColor: fillColor ?? Colors.primary,
              },
            ]}
          />
        )}
      </View>
      <Text style={styles.percentText}>{Math.round(clamped * 100)}%</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: Spacing.lg2,
      paddingRight: Spacing.sm,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
      width: "100%",
    },
    containerNoIcon: {
      paddingLeft: Spacing.sm,
    },
    icon: {
      width: 18,
      height: 18,
      marginRight: 10,
      tintColor: Colors.textPrimary,
    },
    track: {
      position: "relative",
      flex: 1,
      height: 16,
      backgroundColor: Colors.surface,
      borderRadius: Radius.xs,
      borderWidth: 2,
      borderColor: Colors.border,
      justifyContent: "center",
    },
    //sits over the track border, never taller
    fill: {
      position: "absolute",
      left: -2,
      top: -2,
      bottom: -2,
      borderRadius: Radius.xs,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
    },
    percentText: {
      marginLeft: 10,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textSecondary,
    },
  });
