import { Box, Button, Column, Image, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import {
  background,
  cornerRadius,
  fillMaxHeight,
  fillMaxSize,
  fillMaxWidth,
  height,
  paddingAll,
  size,
  width,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import { DEFAULT_QUICK_ACTIONS, type QuickActionsProps } from "./widgetProps";

const QuickActionsAndroid = (props: QuickActionsProps, environment: WidgetEnvironment) => {
  "widget";
  const colors = environment.colorScheme === "dark" ? props.dark : props.light;
  const m = props.metrics;

  //no border modifier so nest boxes
  const tile = (url: string, label: string, icon: string, filled: boolean) => {
    const ink = filled ? colors.onPrimary : colors.text;
    const iconSize = props.wide ? 24 : 18;
    const iconView = icon ? (
      <Image
        source={{ uri: icon }}
        tint={ink}
        contentDescription={null}
        modifiers={[size(iconSize, iconSize)]}
      />
    ) : null;
    const labelView = (
      <Text color={ink} style={{ fontSize: m.fontSize }}>
        {label}
      </Text>
    );
    return (
      <Button
        //@ts-expect-error target missing from types
        target={url}
        modifiers={[
          ...(props.wide ? [width(112), fillMaxHeight()] : [fillMaxWidth(), height(44)]),
          background(filled ? colors.primaryRing : colors.ring),
          cornerRadius(m.radius),
          paddingAll(m.outline),
        ]}
      >
        <Box
          contentAlignment="center"
          modifiers={[
            fillMaxSize(),
            background(filled ? colors.primary : colors.background),
            cornerRadius(m.radius - m.outline),
          ]}
        >
          {props.wide ? (
            <Column horizontalAlignment="center">
              {iconView}
              <Spacer modifiers={[height(6)]} />
              {labelView}
            </Column>
          ) : (
            <Row verticalAlignment="center">
              {iconView}
              <Spacer modifiers={[width(6)]} />
              {labelView}
            </Row>
          )}
        </Box>
      </Button>
    );
  };

  const first = tile(props.newUrl, props.newLabel, props.addIcon, true);
  const second = tile(props.cameraUrl, props.cameraLabel, props.cameraIcon, false);

  return (
    <Box
      contentAlignment="center"
      modifiers={[fillMaxSize(), background(colors.background), cornerRadius(m.windowRadius)]}
    >
      {props.wide ? (
        <Row verticalAlignment="center" modifiers={[fillMaxHeight(), paddingAll(8)]}>
          {first}
          <Spacer modifiers={[width(8)]} />
          {second}
        </Row>
      ) : (
        <Column horizontalAlignment="center" modifiers={[fillMaxWidth(), paddingAll(8)]}>
          {first}
          <Spacer modifiers={[height(6)]} />
          {second}
        </Column>
      )}
    </Box>
  );
};

export const QuickActions = createWidget("QuickActions", QuickActionsAndroid, DEFAULT_QUICK_ACTIONS);

export const QuickActionsWide = createWidget("QuickActionsWide", QuickActionsAndroid, {
  ...DEFAULT_QUICK_ACTIONS,
  wide: true,
});

export default QuickActions;
