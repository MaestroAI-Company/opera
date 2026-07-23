import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { IWidget } from '../../services/widgets/WidgetManager';

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
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    overflow: 'hidden',
    width: '100%',
    padding: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    backgroundColor: '#FFFFFF',
  },
  icon: {
    width: 20,
    height: 20,
    marginRight: 10,
    tintColor: '#FF1A1A',
  },
  titleText: {
    fontSize: 14,
    fontFamily: "IBMPlexMono-Medium",
    color: '#333333',
    fontWeight: '600',
  },
  content: {}
});
