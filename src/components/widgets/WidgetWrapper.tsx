import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Radius, ThemeColors } from '../../../constants/theme';
import { useColors, useThemedStyles } from '../../hooks/useTheme';

interface WidgetWrapperProps {
  widget: Pick<IWidget, 'name' | 'hasBorder'>;
  title?: string;
  children: React.ReactNode;
}

export default function WidgetWrapper({ widget, children }: WidgetWrapperProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  if (!widget.hasBorder) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      {children}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    width: '100%',
    padding: 5,
  },
});
