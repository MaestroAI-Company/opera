import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Colors, Fonts, FontSizes, Radius } from '../../../constants/theme';

interface WidgetWrapperProps {
  widget: IWidget;
  title?: string;
  children: React.ReactNode;
}

export default function WidgetWrapper({ widget, title, children }: WidgetWrapperProps) {
  if (!widget.hasBorder) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titleText}>
          {widget.name}{title ? ` - ${title}` : ''}
        </Text>
      </View>
      <View style={styles.content}>
        {children}
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    backgroundColor: Colors.surface,
    paddingLeft: 6,
  },
  titleText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  content: {}
});


