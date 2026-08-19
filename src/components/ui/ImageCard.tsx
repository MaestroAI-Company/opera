import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '../../../constants/theme';

interface ImageCardProps {
  source: ImageSourcePropType;
  width?: number;
  height?: number;
  alt?: string;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default function ImageCard({
  source,
  width = 200,
  height = 200,
  alt,
}: ImageCardProps) {
  return (
    <View style={[styles.card, { width, height }]}>
      <Image
        source={source}
        style={styles.image}
        alt={alt}
        accessibilityLabel={alt}
      />
    </View>
  );
}
