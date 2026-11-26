import { Button, HStack, Image, ProgressView, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  aspectRatio,
  background,
  buttonStyle,
  clipShape,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  resizable,
  shapes,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import {
  createLiveActivity,
  type LiveActivityEnvironment,
  type LiveActivityLayout,
} from "expo-widgets";
import { CALL_HANGUP, CALL_MUTE, type CallActivityProps, type DownloadActivityProps } from "./liveActivityProps";

const DownloadLayout = (props: DownloadActivityProps, environment: LiveActivityEnvironment): LiveActivityLayout => {
  "widget";
  const colors = environment.colorScheme === "dark" ? props.dark : props.light;
  const m = props.metrics;
  const percent = `${Math.round(props.progress * 100)}%`;
  const mono = (size: number, color: string) => [
    font({ design: "monospaced", size }),
    foregroundStyle(color),
  ];

  return {
    banner: (
      <VStack
        spacing={8}
        modifiers={[padding({ all: 14 }), background(colors.background)]}
      >
        <HStack>
          <Text modifiers={[...mono(m.fontSize, colors.text), lineLimit(1)]}>{props.title}</Text>
          <Spacer />
          <Text modifiers={mono(m.fontSize, colors.primary)}>{percent}</Text>
        </HStack>
        <ProgressView value={props.progress} modifiers={[tint(colors.primary)]} />
        <Text modifiers={[...mono(m.fontSizeSm, colors.text), lineLimit(1)]}>{props.detail}</Text>
      </VStack>
    ),
    compactLeading: <Image systemName="arrow.down.circle" size={14} color={colors.primary} />,
    compactTrailing: <Text modifiers={mono(m.fontSizeSm, colors.primary)}>{percent}</Text>,
    minimal: <Image systemName="arrow.down.circle" size={14} color={colors.primary} />,
    expandedLeading: <Image systemName="arrow.down.circle" size={22} color={colors.primary} />,
    expandedCenter: <Text modifiers={[...mono(m.fontSize, colors.text), lineLimit(1)]}>{props.title}</Text>,
    expandedTrailing: <Text modifiers={mono(m.fontSize, colors.primary)}>{percent}</Text>,
    expandedBottom: (
      <VStack spacing={6}>
        <ProgressView value={props.progress} modifiers={[tint(colors.primary)]} />
        <Text modifiers={[...mono(m.fontSizeSm, colors.text), lineLimit(1)]}>{props.detail}</Text>
      </VStack>
    ),
  };
};

const CallLayout = (props: CallActivityProps, environment: LiveActivityEnvironment): LiveActivityLayout => {
  "widget";
  const colors = environment.colorScheme === "dark" ? props.dark : props.light;
  const m = props.metrics;
  const mono = (size: number, color: string) => [
    font({ design: "monospaced", size }),
    foregroundStyle(color),
  ];

  //butterfly cutout shows the accent
  const avatar = (size: number) => (
    <ZStack modifiers={[frame({ width: size, height: size }), background(props.accent), clipShape("circle")]}>
      {props.image ? (
        <Image
          uiImage={props.image}
          modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), padding({ all: size * 0.08 })]}
        />
      ) : null}
    </ZStack>
  );

  const timer = (size: number) => (
    <Text date={new Date(props.startedAt)} dateStyle="timer" modifiers={mono(size, colors.text)} />
  );

  //nested backgrounds draw the outline
  const action = (target: string, label: string, filled: boolean) => {
    const ink = filled ? colors.onPrimary : colors.text;
    return (
      <Button
        target={target}
        modifiers={[
          buttonStyle("plain"),
          frame({ maxWidth: Infinity }),
          padding({ vertical: 8 }),
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
        <Text modifiers={mono(m.fontSize, ink)}>{label}</Text>
      </Button>
    );
  };

  const buttons = (
    <HStack spacing={8}>
      {action(CALL_MUTE, props.muteLabel, false)}
      {action(CALL_HANGUP, props.hangUpLabel, true)}
    </HStack>
  );

  return {
    banner: (
      <VStack spacing={12} modifiers={[padding({ all: 14 }), background(colors.background)]}>
        <HStack spacing={10}>
          {avatar(44)}
          <VStack spacing={2}>
            <Text modifiers={mono(m.fontSize, colors.text)}>{props.title}</Text>
            <Text modifiers={[...mono(m.fontSizeSm, colors.text), lineLimit(1)]}>{props.text}</Text>
          </VStack>
          <Spacer />
          {timer(m.fontSize)}
        </HStack>
        {buttons}
      </VStack>
    ),
    compactLeading: avatar(22),
    compactTrailing: timer(m.fontSizeSm),
    minimal: avatar(22),
    expandedLeading: avatar(36),
    expandedCenter: <Text modifiers={mono(m.fontSize, colors.text)}>{props.title}</Text>,
    expandedTrailing: timer(m.fontSize),
    expandedBottom: buttons,
  };
};

export const downloadActivity = createLiveActivity("ModelDownload", DownloadLayout);
export const callActivity = createLiveActivity("LiveCall", CallLayout);
