import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Colors, Radius } from '../../../constants/theme';

interface WidgetWrapperProps {
  widget: Pick<IWidget, 'name' | 'hasBorder'>;
  title?: string;
  children: React.ReactNode;
}

export default function WidgetWrapper({ widget, children }: WidgetWrapperProps) {
  if (!widget.hasBorder) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: '100%',
    padding: 5,
  },
});
