import { Box, Image } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget } from "expo-widgets";
import { DEFAULT_BUTTERFLY, type ButterflyProps } from "./widgetProps";

const ButterflyAndroid = (props: ButterflyProps) => {
  "widget";
  //accent cutout shows the background
  return (
    <Box
      contentAlignment="center"
      modifiers={[fillMaxSize(), background(props.accent), cornerRadius(props.radius)]}
    >
      {props.image ? (
        <Image
          source={{ uri: props.image }}
          contentScale="fit"
          contentDescription={null}
          modifiers={[fillMaxSize(), paddingAll(8)]}
        />
      ) : null}
    </Box>
  );
};

export default createWidget("Butterfly", ButterflyAndroid, DEFAULT_BUTTERFLY);
