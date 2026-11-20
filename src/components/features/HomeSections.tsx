import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    Platform,
    ScrollView,
    StyleSheet,
    Vibration,
    View,
} from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
    AnimatedRef,
    DerivedValue,
    Easing,
    SharedValue,
    measure as measureView,
    scrollTo,
    useAnimatedReaction,
    useAnimatedStyle,
    useDerivedValue,
    useFrameCallback,
    useScrollOffset,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useResponsive } from "../../hooks/useResponsive";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import IconButton from "../ui/IconButton";
import { setHomeEditing, useHomeEditing } from "./homeEditing";

const deleteIcon = require("../../../assets/icons/delete.png");

//sections shrink to this while editing, the sides hold the buttons
const EDIT_SCALE = 0.7;
const EDIT_MS = 220;
//the grabbed section grows by this, the buttons stay clear of it
const LIFT_SCALE = 1.08;
const LIFT_MS = 220;
//the grow and the shrink overshoot a bit before resting
const LIFT_BOUNCE = 1;
//the others slide aside as the grabbed one passes
const MAKE_ROOM_MS = 260;
const MAKE_ROOM_BOUNCE = 0.8;
//a release overshoots its slot then rests, a timing so the drop lands on a known frame
const SETTLE_MS = 320;
const SETTLE_BOUNCE = 1.1;
//pull past the first or last slot gets harder as it goes
const RUBBER_RANGE = 100;
//a finger this close to the top or bottom edge scrolls the page, faster the closer it is
const EDGE_ZONE = 90;
//page speed in px per second with the finger right on the edge
const EDGE_SPEED = 900;
//hold this long on a section to grab it
const HOLD_MS = 350;
//same as the ActionButton icons
const CONTROL_ICON = 18;
const CONTROL_SIZE = 36;
//looks 2px once the section is shrunk, like the sticker outlines
const EDIT_BORDER = 2 / EDIT_SCALE;
//extra space under each section while editing, the frames need room
const EDIT_SPACING = Spacing.xl2;
//empty space between the section and the frame
const EDIT_GAP = Spacing.xs / EDIT_SCALE;
//margin under each section card, outside the card itself
const SECTION_GAP = Spacing.xxl2;
//same as the section cards
const SECTION_RADIUS = Radius.xxl + Spacing.md;

//rubber-band curve resists further pull
const rubberBand = (d: number, dim: number) => {
  "worklet";
  const sign = d < 0 ? -1 : 1;
  return sign * dim * (1 - 1 / (1 + Math.abs(d) / dim));
};

//height of the slots from one to the other
const span = (sizes: number[], from: number, to: number) => {
  "worklet";
  let total = 0;
  for (let i = from; i < to; i++) total += sizes[i];
  return total;
};

//where the grabbed section is drawn and which slot it is over
const follow = (sizes: number[], from: number, dy: number) => {
  "worklet";
  const top = span(sizes, 0, from);
  //first and last slot, the pull goes past them with a resistance
  const inside = Math.max(
    -top,
    Math.min(span(sizes, 0, sizes.length) - top - sizes[from], dy),
  );
  //the leading edge passes a neighbour's middle, so a tall section still reaches the ends
  const edgeTop = top + inside;
  const edgeBottom = edgeTop + sizes[from];
  let to = from;
  let start = 0;
  for (let i = 0; i < sizes.length; i++) {
    const middle = start + sizes[i] / 2;
    if (i < from && middle > edgeTop) to--;
    if (i > from && middle < edgeBottom) to++;
    start += sizes[i];
  }
  return { offset: inside + rubberBand(dy - inside, RUBBER_RANGE), to };
};

const buzz = () => Vibration.vibrate(10);

export type HomeSection = { id: string; content: ReactNode };

//one set for every row, all of it read on the UI thread while a section is dragged
type DragState = {
  //0 at rest, 1 once the sections are shrunk
  progress: SharedValue<number>;
  //shrunk height of each section by id
  sizeById: SharedValue<Record<string, number>>;
  //shrunk height of each section, in the order shown
  sizes: DerivedValue<number[]>;
  //section ids in the order shown, a drop swaps it on the ui thread alone
  order: SharedValue<string[]>;
  //section ids in the order the views are laid out, it only changes when the edit ends
  layout: SharedValue<string[]>;
  //slot of the grabbed section, -1 when none
  active: SharedValue<number>;
  //slot it is over now
  target: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
  //a released section is still sliding into its slot
  settling: SharedValue<boolean>;
  //finger height on the screen, -1 when nothing is held
  pointer: SharedValue<number>;
  //how far the finger moved since the grab
  travel: SharedValue<number>;
  //page scroll now and when the grab began
  scroll: SharedValue<number>;
  grabScroll: SharedValue<number>;
};

//the grabbed section follows the finger and the page scrolling under it
const place = (drag: DragState) => {
  "worklet";
  const { sizes, active, target, dragY, travel, scroll, grabScroll } = drag;
  const placed = follow(
    sizes.get(),
    active.get(),
    travel.get() + scroll.get() - grabScroll.get(),
  );
  dragY.set(placed.offset);
  if (placed.to === target.get()) return;
  target.set(placed.to);
  scheduleOnRN(buzz);
};

type RowProps = {
  id: string;
  content: ReactNode;
  editing: boolean;
  drag: DragState;
  onMeasure: (id: string, height: number) => void;
  onDrop: (ids: string[]) => void;
  onRemove: (id: string) => void;
};

function HomeSectionRow({
  id,
  content,
  editing,
  drag,
  onMeasure,
  onDrop,
  onRemove,
}: RowProps) {
  const {
    progress,
    order,
    layout,
    sizeById,
    sizes,
    active,
    target,
    dragY,
    lift,
    settling,
    pointer,
    travel,
    scroll,
    grabScroll,
  } = drag;
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();
  //natural height, 0 until measured
  const natural = useSharedValue(0);
  const slot = useDerivedValue(() => order.get().indexOf(id));

  //where the views are laid out and where the order shows it, the gap is its offset
  const home = useDerivedValue(() => {
    const me = slot.value;
    if (me < 0) return 0;
    const list = layout.value;
    const byId = sizeById.value;
    const mine = list.indexOf(id);
    let laid = 0;
    for (let i = 0; i < mine; i++) laid += byId[list[i]] ?? 0;
    return span(sizes.value, 0, me) - laid;
  });

  //the others make room for the grabbed one, a drop puts them back with no motion
  const shift = useDerivedValue(() => {
    const from = active.value;
    if (from < 0) return 0;
    const me = slot.value;
    const to = target.value;
    const size = sizes.value[from] ?? 0;
    let room = 0;
    if (from < me && me <= to) room = -size;
    else if (to <= me && me < from) room = size;
    return withTiming(room, {
      duration: MAKE_ROOM_MS,
      easing: Easing.out(Easing.back(MAKE_ROOM_BOUNCE)),
    });
  });

  //the grip grabs on touch, the section itself after a long press
  const makePan = (onSection: boolean) => {
    const mine = useSharedValue(false);
    const grab = () => {
      "worklet";
      if (settling.get() || active.get() >= 0) return;
      mine.set(true);
      active.set(slot.get());
      target.set(slot.get());
      dragY.set(0);
      travel.set(0);
      grabScroll.set(scroll.get());
      lift.set(
        withTiming(1, {
          duration: LIFT_MS,
          easing: Easing.out(Easing.back(LIFT_BOUNCE)),
        }),
      );
      if (onSection) scheduleOnRN(buzz);
    };
    return usePanGesture({
      enabled: editing,
      //a grip held still must not take the page scroll, a small pull does
      activeOffsetY: onSection ? undefined : [-3, 3],
      activateAfterLongPress: onSection ? HOLD_MS : undefined,
      onBegin: () => {
        "worklet";
        if (!onSection) grab();
      },
      onActivate: () => {
        "worklet";
        if (onSection) grab();
      },
      onUpdate: (e) => {
        "worklet";
        if (!mine.get()) return;
        pointer.set(e.absoluteY);
        travel.set(e.translationY);
        place(drag);
      },
      onFinalize: () => {
        "worklet";
        if (!mine.get()) return;
        mine.set(false);
        //the page stops following the finger
        pointer.set(-1);
        settling.set(true);
        const from = slot.get();
        const to = target.get();
        const list = sizes.get();
        //its slot, from where it started
        const rest =
          to > from ? span(list, from + 1, to + 1) : -span(list, to, from);
        lift.set(
          withTiming(0, {
            duration: LIFT_MS,
            easing: Easing.out(Easing.back(LIFT_BOUNCE)),
          }),
        );
        dragY.set(
          withTiming(
            rest,
            {
              duration: SETTLE_MS,
              easing: Easing.out(Easing.back(SETTLE_BOUNCE)),
            },
            () => {
              "worklet";
              //the new slots and the reset land in one ui frame, the views never move
              const next = order.get().slice();
              next.splice(to, 0, ...next.splice(from, 1));
              order.set(next);
              active.set(-1);
              target.set(-1);
              dragY.set(0);
              lift.set(0);
              settling.set(false);
              scheduleOnRN(onDrop, next);
            },
          ),
        );
      },
    });
  };
  const { isDesktop } = useResponsive();
  const hasMouse =
    isDesktop ||
    Platform.OS === "windows" ||
    Platform.OS === "macos" ||
    (Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: fine)")?.matches === true);
  //mouse drags immediately without a long press
  const sectionPan = makePan(!hasMouse);

  //the layout follows the shrunk size, a transform alone leaves a gap
  const rowStyle = useAnimatedStyle(() => {
    const dragging = active.value === slot.value;
    return {
      marginBottom:
        progress.value * (EDIT_SPACING - (1 - EDIT_SCALE) * natural.value),
      zIndex: dragging ? 2 : 0,
      transform: [
        { translateY: home.value + (dragging ? dragY.value : shift.value) },
      ],
    };
  });

  //one scale shrinks it from the top and grows the grabbed one around its middle
  const contentStyle = useAnimatedStyle(() => {
    const shrunk = 1 - (1 - EDIT_SCALE) * progress.value;
    const grow =
      active.value === slot.value ? 1 + (LIFT_SCALE - 1) * lift.value : 1;
    return {
      transform: [
        { translateY: ((shrunk * natural.value) / 2) * (1 - grow) },
        { scale: shrunk * grow },
      ],
    };
  });

  //the frame fades in with the shrink
  //the others lose it while one is dragged, a timing cannot sit inside a product
  const frameShown = useDerivedValue(() =>
    withTiming(active.value >= 0 && active.value !== slot.value ? 0 : 1, {
      duration: LIFT_MS,
    }),
  );
  const frameStyle = useAnimatedStyle(() => ({
    opacity: progress.value * frameShown.value,
  }));

  //the buttons fade in and out with the shrink, in the margins it leaves
  const controlsStyle = useAnimatedStyle(() => ({
    height:
      Math.max(0, natural.value - SECTION_GAP) *
      (1 - (1 - EDIT_SCALE) * progress.value),
    //every delete button hides while a section is held
    opacity: progress.value * (1 - lift.value),
  }));

  return (
    <Animated.View style={rowStyle}>
      <GestureDetector gesture={sectionPan}>
        <Animated.View
          onLayout={(e) => {
            natural.set(e.nativeEvent.layout.height);
            onMeasure(id, e.nativeEvent.layout.height);
          }}
          style={[styles.content, contentStyle]}
        >
          <View pointerEvents={editing ? "none" : "auto"}>{content}</View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.frame,
              { borderColor: Colors.surfacePressed },
              frameStyle,
            ]}
          />
        </Animated.View>
      </GestureDetector>
      <Animated.View
        pointerEvents={editing ? "box-none" : "none"}
        accessibilityElementsHidden={!editing}
        importantForAccessibility={editing ? "auto" : "no-hide-descendants"}
        style={[styles.controls, controlsStyle]}
      >
        <IconButton
          icon={deleteIcon}
          label={t("sampler.home.remove")}
          size={CONTROL_ICON}
          containerSize={CONTROL_SIZE}
          tintColor={Colors.textPrimary}
          style={styles.remove}
          onPress={() => onRemove(id)}
        />
      </Animated.View>
    </Animated.View>
  );
}

type HomeSectionsProps = {
  sections: HomeSection[];
  //page scroll view, scrolled when a section is held near its top or bottom
  scrollRef: AnimatedRef<ScrollView>;
  //what covers the top and bottom of that scroll view
  topInset: number;
  bottomInset: number;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
};

//the home sections, shrunk while editing with a grip to reorder and a bin to remove each one
export default function HomeSections({
  sections,
  scrollRef,
  topInset,
  bottomInset,
  onReorder,
  onRemove,
}: HomeSectionsProps) {
  const editing = useHomeEditing();
  const progress = useSharedValue(0);
  const order = useSharedValue<string[]>(sections.map((section) => section.id));
  const layout = useSharedValue<string[]>(
    sections.map((section) => section.id),
  );
  const sizeById = useSharedValue<Record<string, number>>({});
  const sizes = useDerivedValue(() =>
    order.get().map((id) => sizeById.get()[id] ?? 0),
  );
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const lift = useSharedValue(0);
  const settling = useSharedValue(false);
  const pointer = useSharedValue(-1);
  const travel = useSharedValue(0);
  const grabScroll = useSharedValue(0);
  const scroll = useScrollOffset(scrollRef);
  const drag: DragState = {
    progress,
    order,
    layout,
    sizeById,
    sizes,
    active,
    target,
    dragY,
    lift,
    settling,
    pointer,
    travel,
    scroll,
    grabScroll,
  };
  const heights = useRef<Record<string, number>>({});
  const sent = useRef("");
  //the drop is read through this, it lands after the render that reorders
  const latest = useRef({ sections, onReorder });
  //last order sent to the ui thread
  const pushed = useRef(sections.map((section) => section.id).join());
  //last layout order sent to the ui thread
  const laidOut = useRef(sections.map((section) => section.id).join());
  //what each section showed and where it sat when the edit began, a poll cannot change a height under the drag
  const [frozen, setFrozen] = useState<{
    editing: boolean;
    ids: string[];
    contents: Record<string, ReactNode>;
  }>({
    editing: false,
    ids: [],
    contents: {},
  });
  //a section added while editing is frozen as it first shows
  if (
    frozen.editing !== editing ||
    (editing && sections.some((section) => !(section.id in frozen.contents)))
  ) {
    const kept =
      editing && frozen.editing
        ? frozen.ids.filter((id) =>
            sections.some((section) => section.id === id),
          )
        : [];
    setFrozen({
      editing,
      ids: editing
        ? [
            ...kept,
            ...sections
              .map((section) => section.id)
              .filter((id) => !kept.includes(id)),
          ]
        : [],
      contents: editing
        ? Object.fromEntries(
            sections.map((section) => [
              section.id,
              frozen.contents[section.id] ?? section.content,
            ]),
          )
        : {},
    });
  }
  //a drop reorders the saved list, the views stay where they were until the edit ends
  const byId = Object.fromEntries(
    sections.map((section) => [section.id, section]),
  );
  const shown =
    editing && frozen.editing
      ? frozen.ids
          .filter((id) => id in byId)
          .concat(
            sections
              .map((section) => section.id)
              .filter((id) => !frozen.ids.includes(id)),
          )
      : sections.map((section) => section.id);

  useEffect(() => {
    progress.set(withTiming(editing ? 1 : 0, { duration: EDIT_MS }));
  }, [editing, progress]);

  //a held section near the top or bottom edge brings the page along
  const edgeScroll = useFrameCallback((frame) => {
    const y = pointer.get();
    if (y < 0) return;
    const box = measureView(scrollRef);
    if (!box) return;
    const top = box.pageY + topInset + EDGE_ZONE;
    const bottom = box.pageY + box.height - bottomInset - EDGE_ZONE;
    const depth =
      y < top
        ? -(top - y) / EDGE_ZONE
        : y > bottom
          ? (y - bottom) / EDGE_ZONE
          : 0;
    if (depth === 0) return;
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50) / 1000;
    const next =
      scroll.get() + Math.max(-1, Math.min(1, depth)) * EDGE_SPEED * dt;
    scrollTo(scrollRef, 0, Math.max(0, next), false);
  }, false);

  useEffect(() => {
    edgeScroll.setActive(editing);
  }, [editing, edgeScroll]);

  //the page moved under a held finger, the section moves with it
  useAnimatedReaction(
    () => scroll.get(),
    () => {
      if (pointer.get() >= 0) place(drag);
    },
  );

  //leaving the page ends the edit
  useEffect(() => () => setHomeEditing(false), []);

  //the drag only reads sizes on the UI thread, they are sent when one changes
  const sendSizes = () => {
    const list = latest.current.sections.map(
      (section) =>
        (heights.current[section.id] ?? 0) * EDIT_SCALE + EDIT_SPACING,
    );
    const key = list.join();
    if (key === sent.current) return;
    sent.current = key;
    sizeById.set(
      Object.fromEntries(
        latest.current.sections.map((section, i) => [section.id, list[i]]),
      ),
    );
  };

  const measure = (id: string, height: number) => {
    heights.current[id] = height;
    sendSizes();
  };

  //the saved list changed outside a drop, the order and the reset land in one worklet
  const rest = (ids: string[], laid: string[]) => {
    scheduleOnUI(() => {
      "worklet";
      layout.set(laid);
      order.set(ids);
      active.set(-1);
      target.set(-1);
      dragY.set(0);
      lift.set(0);
      settling.set(false);
    });
  };

  //the ui thread already holds this order, only the saved list needs it
  const drop = (ids: string[]) => {
    if (ids.join() === pushed.current) return;
    pushed.current = ids.join();
    latest.current.onReorder(ids);
  };

  useLayoutEffect(() => {
    latest.current = { sections, onReorder };
    sendSizes();
    const ids = sections.map((section) => section.id);
    const laid = shown.join();
    if (ids.join() !== pushed.current) {
      pushed.current = ids.join();
      laidOut.current = laid;
      rest(ids, shown);
    } else if (laid !== laidOut.current) {
      laidOut.current = laid;
      scheduleOnUI(() => {
        "worklet";
        layout.set(shown);
      });
    }
  });

  return (
    <>
      {shown
        .map((id) => byId[id])
        .map((section) => (
          <HomeSectionRow
            key={section.id}
            id={section.id}
            content={
              editing
                ? (frozen.contents[section.id] ?? section.content)
                : section.content
            }
            editing={editing}
            drag={drag}
            onMeasure={measure}
            onDrop={drop}
            onRemove={onRemove}
          />
        ))}
    </>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      transformOrigin: "top",
    },
    //drawn outside the section so its height stays the measured one
    frame: {
      position: "absolute",
      top: -(EDIT_BORDER + EDIT_GAP),
      left: -(EDIT_BORDER + EDIT_GAP),
      right: -(EDIT_BORDER + EDIT_GAP),
      //the card margin is measured with the section, the frame stops at the card
      bottom: SECTION_GAP - (EDIT_BORDER + EDIT_GAP),
      borderWidth: EDIT_BORDER,
      borderRadius: SECTION_RADIUS + EDIT_BORDER + EDIT_GAP,
    },
    controls: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      //the shrunk section spans the middle 70%
      paddingHorizontal: `${((1 - EDIT_SCALE) / 2) * 100}%`,
      justifyContent: "flex-end",
      alignItems: "center",
    },
    //laid out at the home width, the scale shrinks it from the top
    remove: {
      backgroundColor: Colors.surface,
      //in the margin right of the frame, which sits 8px outside the shrunk section
      marginRight: -(CONTROL_SIZE + 8 + Spacing.xs),
    },
  });
