import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useKeyboardAnimation, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useBugReport } from "../../hooks/useBugReport";
import { useT } from "../../i18n";
import { useThemedStyles } from "../../hooks/useTheme";
import type { Crash } from "../../services/logging/CrashReporter";
import ActionButton from "../ui/ActionButton";
import Checkbox from "../ui/Checkbox";
import Group from "../ui/Group";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import TextInputField from "../ui/TextInputField";
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
  const t = useT();
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string; message: string; buttons?: ModalButton[] }>({ title: "", message: "" });
  //fluid, native-driven keyboard height, same source as the chatbar's KeyboardAvoidingView
  const { height: keyboardHeight } = useKeyboardAnimation();
  const isKeyboardOpen = useKeyboardState((state) => state.isVisible);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const notify = useCallback((title: string, message: string, buttons?: ModalButton[]) => {
    setAlertConfig({ title, message, buttons });
    setAlertVisible(true);
  }, []);

  const report = useBugReport(notify);
  const { reset } = report;

  useEffect(() => {
    if (visible) reset(crash, screenshot);
  }, [visible, crash, screenshot, reset]);

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
        keyboardTranslateY={keyboardHeight}
        sheetStyle={[
          styles.sheet,
          { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + (isKeyboardOpen ? 0 : bottomInset), maxHeight: windowHeight - insets.top - Spacing.xl2 },
        ]}
        desktopStyle={[styles.desktopCard, centeredStyle]}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.contentCard}>
            <Text style={styles.title}>{crash ? t("bugReport.crashTitle") : t("bugReport.title")}</Text>

            {crash && (
              <Text style={styles.help}>
                {t("bugReport.crashHelp")}
              </Text>
            )}

            <View style={styles.inputGroup}>
              <Group>
                <TextInputField
                  icon={penPlaceholderIcon}
                  placeholder={crash ? t("bugReport.crashPlaceholder") : t("bugReport.placeholder")}
                  value={report.text}
                  onChangeText={report.setText}
                />
              </Group>
            </View>

            <View style={styles.toggleRow}>
              <Checkbox
                label={t("bugReport.attachLogs")}
                checked={report.logs !== null}
                onToggle={report.toggleLogs}
                labelFirst
                style={styles.checkboxRow}
              />
            </View>

            {screenshot && (
              <View style={styles.toggleRow}>
                <Checkbox
                  label={t("bugReport.attachScreenshot")}
                  checked={report.screenshot !== null}
                  onToggle={(v) => report.setScreenshot(v ? screenshot : null)}
                  labelFirst
                  style={styles.checkboxRow}
                />
              </View>
            )}

            <Text style={[styles.help, styles.consent]}>
              {t("bugReport.consent")}
              {report.screenshot ? " " + t("bugReport.consentScreenshot") : ""}
            </Text>

            <Group style={styles.highlightGroup}>
              <ActionButton
                icon={arrowIcon}
                label={t("bugReport.send")}
                onPress={() => report.send(onClose)}
                variant="highlight"
              />
            </Group>
          </View>
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
    backgroundColor: Colors.groupedBackground,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: 12,
  },
  desktopCard: {
    backgroundColor: Colors.groupedBackground,
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
    marginBottom: Spacing.xs2,
    paddingVertical: 10,
    marginTop: -10,
  },
  content: {
    paddingHorizontal: Spacing.lg2,
    paddingBottom: Spacing.lg,
  },
  contentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
    padding: Spacing.md,
  },
  title: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginBottom: 6,
  },
  help: {
    fontSize: FontSizes.caption,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    paddingHorizontal: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  consent: {
    marginTop: 12,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: Spacing.md,
  },
  checkboxRow: {
    flex: 1,
    justifyContent: "space-between",
  },
  highlightGroup: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
});
