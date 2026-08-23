import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { REPORT_CONSENT, REPORT_LOG_LINES, useBugReport } from "../../hooks/useBugReport";
import { useThemedStyles } from "../../hooks/useTheme";
import type { Crash } from "../../services/logging/CrashReporter";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import DrawerSheet from "./DrawerSheet";

const penPlaceholderIcon = require("../../../assets/icons/pencil.png");
const arrowIcon = require("../../../assets/icons/arrow.png");

const DESKTOP_CARD_WIDTH = 380;
const DESKTOP_MARGIN = 24;

type BugReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  crash?: Crash | null;
  screenshot?: string | null;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  bottomInset?: number;
};

//opens on shake or after crash
export default function BugReportSheet({ visible, onClose, crash = null, screenshot = null, isLargeScreen = false, isDesktop = false, bottomInset = 0 }: BugReportSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string; message: string; buttons?: ModalButton[] }>({ title: "", message: "" });

  //sheet clears the android keyboard itself
  const keyboardHeight = useKeyboardState((state) => state.height);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const notify = useCallback((title: string, message: string, buttons?: ModalButton[]) => {
    setAlertConfig({ title, message, buttons });
    setAlertVisible(true);
  }, []);

  const report = useBugReport(notify);
  const { reset } = report;

  useEffect(() => {
    if (visible) reset(crash, screenshot);
  }, [visible, crash, screenshot, reset]);

  //report form centered not docked
  //content sized card sits above centre
  const centeredStyle = {
    position: "absolute" as const,
    left: Math.max(DESKTOP_MARGIN, (windowWidth - DESKTOP_CARD_WIDTH) / 2),
    top: Math.max(DESKTOP_MARGIN, windowHeight * 0.12),
    maxHeight: windowHeight * 0.76,
  };

  return (
    <>
      <DrawerSheet
        visible={visible}
        onClose={onClose}
        mode="overlay"
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        handleContainerStyle={styles.sheetHandleContainer}
        sheetStyle={[
          styles.sheet,
          //field stays visible above keyboard
          { bottom: keyboardHeight, paddingBottom: (Platform.OS === "ios" ? 20 : 10) + (keyboardHeight ? 0 : bottomInset) },
        ]}
        desktopStyle={[styles.desktopCard, centeredStyle]}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{crash ? "Opera closed unexpectedly" : "Report a bug"}</Text>

          {crash && (
            <Text style={[styles.help, styles.consent]}>
              The error was saved. Tell us what you were doing, it helps us find it.
            </Text>
          )}

          <Group style={styles.groupSpacing}>
            <TextInputField
              icon={penPlaceholderIcon}
              placeholder={crash ? "What were you doing?" : "Describe the issue"}
              value={report.text}
              onChangeText={report.setText}
            />
          </Group>

          <View style={styles.toggleRow}>
            <Text style={styles.label}>Attach {REPORT_LOG_LINES} log lines</Text>
            <Toggle checked={report.logs !== null} onToggle={report.toggleLogs} />
          </View>

          {screenshot && (
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Attach a screenshot</Text>
              <Toggle
                checked={report.screenshot !== null}
                onToggle={(v) => report.setScreenshot(v ? screenshot : null)}
              />
            </View>
          )}

          <Text style={[styles.help, styles.consent]}>
            {REPORT_CONSENT}
            {report.screenshot ? " The screenshot taken when you shook the phone goes to your clipboard, paste it into the issue if it helps." : ""}
          </Text>

          <Group>
            <ActionButton
              icon={arrowIcon}
              label="Send my issue"
              onPress={() => report.send(onClose)}
            />
          </Group>
        </ScrollView>
      </DrawerSheet>

      <NotificationModal
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
    </>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: 12,
    maxHeight: "85%",
  },
  desktopCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    boxShadow: `-6px 6px 0px ${Colors.shadowInk}`,
    elevation: 5,
    width: DESKTOP_CARD_WIDTH,
    overflow: "hidden",
  },
  sheetHandleContainer: {
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 10,
    marginTop: -10,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    fontFamily: Fonts.body,
    marginBottom: 6,
  },
  label: {
    fontSize: FontSizes.bodyMd,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
  },
  help: {
    fontSize: FontSizes.caption,
    color: Colors.textMuted,
    fontFamily: Fonts.mono,
  },
  consent: {
    marginTop: 12,
    marginBottom: 12,
  },
  groupSpacing: {
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 4,
  },
});
