import { HStack, Image, Link, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import { DEFAULT_QUICK_ACTIONS, type QuickActionsProps } from "./widgetProps";

const QuickActionsIos = (props: QuickActionsProps, environment: WidgetEnvironment) => {
  "widget";
  const colors = environment.colorScheme === "dark" ? props.dark : props.light;
  const m = props.metrics;
  const wide = environment.widgetFamily === "systemMedium";

  //nested backgrounds draw the outline
  const tile = (url: string, label: string, symbol: "plus" | "camera", filled: boolean) => {
    const ink = filled ? colors.onPrimary : colors.text;
    return (
      <Link
        destination={url}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(
            filled ? colors.primary : colors.background,
            shapes.roundedRectangle({ cornerRadius: m.radius - m.outline })
          ),
          padding({ all: m.outline }),
          background(
            filled ? colors.primaryRing : colors.ring,
            shapes.roundedRectangle({ cornerRadius: m.radius })
          ),
        ]}
      >
        <VStack spacing={6}>
          <Image systemName={symbol} size={wide ? 24 : 18} color={ink} />
          <Text modifiers={[font({ design: "monospaced", size: m.fontSize }), foregroundStyle(ink)]}>
            {label}
          </Text>
        </VStack>
      </Link>
    );
  };

  const first = tile(props.newUrl, props.newLabel, "plus", true);
  const second = tile(props.cameraUrl, props.cameraLabel, "camera", false);
  const root = [containerBackground(colors.background, "widget")];

  return wide ? (
    <HStack spacing={8} modifiers={root}>
      {first}
      {second}
    </HStack>
  ) : (
    <VStack spacing={6} modifiers={root}>
      {first}
      {second}
    </VStack>
  );
};

export const QuickActions = createWidget("QuickActions", QuickActionsIos, DEFAULT_QUICK_ACTIONS);

export default QuickActions;
