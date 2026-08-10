import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { IWidget } from '../../services/widgets/WidgetManager';
import { Colors, Fonts, FontSizes, Radius, Spacing } from '../../../constants/theme';

interface WidgetWrapperProps {
  widget: IWidget;
  title?: string;
  children: React.ReactNode;
}

const defaultIcon = require('../../../assets/icons/settings.png'); // fallback icon

export default function WidgetWrapper({ widget, title, children }: WidgetWrapperProps) {
  if (!widget.hasBorder) {
    return <>{children}</>;
  }

  const iconSource = widget.icon || defaultIcon;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image source={iconSource} style={styles.icon} resizeMode="contain" />
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
  },
  icon: {
    width: 20,
    height: 20,
    marginRight: Spacing.lg,
    tintColor: Colors.primary,
  },
  titleText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  content: {}
});
