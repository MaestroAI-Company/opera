import { Asset } from 'expo-asset';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Radius } from '../../../constants/theme';

interface ImageCardProps {
  source: ImageSourcePropType;
  width?: number | `${number}%`;
  height?: number;
  alt?: string;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: Radius.xxl,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

//expo-asset resolves on native and web, unlike Image.resolveAssetSource
const resolveSize = (source: ImageSourcePropType) => {
  if (typeof source === 'number') return Asset.fromModule(source);
  return Array.isArray(source) ? undefined : source;
};

export default function ImageCard({
  source,
  width = 200,
  height,
  alt,
  style,
}: ImageCardProps) {
  //no explicit height: derive it from the source so the image isn't cropped
  const resolved = height === undefined ? resolveSize(source) : undefined;
  const sizeStyle = height !== undefined
    ? { width, height }
    : { width, aspectRatio: resolved?.width && resolved?.height ? resolved.width / resolved.height : 1 };

  return (
    <View style={[styles.card, sizeStyle, style]}>
      <Image
        source={source}
        style={styles.image}
        alt={alt}
        accessibilityLabel={alt}
      />
    </View>
  );
}
