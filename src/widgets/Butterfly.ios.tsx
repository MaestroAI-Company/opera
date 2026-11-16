import { Image, ZStack } from "@expo/ui/swift-ui";
import { aspectRatio, containerBackground, padding, resizable } from "@expo/ui/swift-ui/modifiers";
import { createWidget } from "expo-widgets";
import { DEFAULT_BUTTERFLY, type ButterflyProps } from "./widgetProps";

const ButterflyIos = (props: ButterflyProps) => {
  "widget";
  //accent cutout shows the background
  return (
    <ZStack modifiers={[containerBackground(props.accent, "widget")]}>
      {props.image ? (
        <Image
          uiImage={props.image}
          modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), padding({ all: 8 })]}
        />
      ) : null}
    </ZStack>
  );
};

export default createWidget("Butterfly", ButterflyIos, DEFAULT_BUTTERFLY);
