import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  HubProfile,
  hubErrorCode,
  OperaHub,
  PairedHub,
} from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import { pressStyle } from "../ui/pressStyle";
import TextInputField from "../ui/TextInputField";
import DrawerBackButton from "./DrawerBackButton";
import DrawerSheet, { SheetBody, SheetScrollView } from "./DrawerSheet";
import PageStack from "./PageStack";
import ProfileCard from "./ProfileCard";

const keyIcon = require("../../../assets/icons/key.png");
const newIcon = require("../../../assets/icons/hyperlink2.png");
const penIcon = require("../../../assets/icons/pencil.png");

const DESKTOP_CARD_WIDTH = 380;
//shorter passwords fall to a guessing hub
export const MIN_PASSWORD_LENGTH = 8;

type Page = "pick" | "create" | "unlock" | "link" | "password";

type HubProfileSheetProps = {
  visible: boolean;
  hub: PairedHub | null;
  //onboarding restores, settings may also create
  allowCreate?: boolean;
  //prefilled name of a new profile
  defaultName?: string;
  //opens on the password change instead
  changePassword?: boolean;
  onClose: () => void;
  onDone: (profile: HubProfile) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

const parentOf = (page: Page): Page | null =>
  page === "create" || page === "unlock" ? "pick" : null;

//pick, create, unlock or link a profile on a sampler
export default function HubProfileSheet({
  visible,
  hub,
  allowCreate = true,
  defaultName = "",
  changePassword = false,
  onClose,
  onDone,
  isLargeScreen = false,
  isDesktop = false,
}: HubProfileSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>("pick");
  const [profiles, setProfiles] = useState<HubProfile[] | null>(null);
  const [chosen, setChosen] = useState<HubProfile | null>(null);
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [digits, setDigits] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  //parents pass a fresh callback each render
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  //each opening starts clean
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPage(changePassword ? "password" : "pick");
      setProfiles(null);
      setChosen(null);
      setName(defaultName);
      setPassword("");
      setConfirm("");
      setCurrent("");
      setDigits(null);
      setBusy(false);
      setError(null);
    }
  }

  //a link code joins at once, an admin code lists profiles
  useEffect(() => {
    if (!visible || !hub || changePassword) return;
    let stopped = false;
    (async () => {
      try {
        if (await OperaHub.linkJoin(hub)) {
          setPage("link");
          while (!stopped) {
            const progress = await OperaHub.linkFetch(hub);
            if (stopped) return;
            setDigits(progress.digits);
            if (progress.profile) return onDoneRef.current(progress.profile);
            if (progress.denied) return setError(t("hubProfile.linkDenied"));
          }
          return;
        }
        const list = await OperaHub.profiles(hub);
        if (!stopped) setProfiles(list);
      } catch (e) {
        console.warn("[HubProfile] profiles unavailable:", e);
        if (!stopped) setError(t(`hubPairing.error.${hubErrorCode(e)}`));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [visible, hub, changePassword, t]);

  const showPage = (next: Page) => {
    setScrolled(false);
    setError(null);
    setPassword("");
    setConfirm("");
    setPage(next);
  };

  const handleBack = () => {
    const parent = parentOf(page);
    if (!parent || busy) return false;
    showPage(parent);
    return true;
  };

  //the hub explains wrong passwords and lockouts
  const failure = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("too many")) return t("hubProfile.tooMany");
    if (message.includes("wrong password"))
      return t("hubProfile.wrongPassword");
    return t(`hubPairing.error.${hubErrorCode(e)}`);
  };

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      console.warn("[HubProfile] failed:", e);
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };

  const passwordProblem = () => {
    if (password.length < MIN_PASSWORD_LENGTH)
      return t("hubProfile.tooShort", { count: MIN_PASSWORD_LENGTH });
    if (password !== confirm) return t("hubProfile.mismatch");
    return null;
  };

  const create = () => {
    const problem = !name.trim()
      ? t("hubProfile.nameNeeded")
      : passwordProblem();
    if (problem) return setError(problem);
    run(async () =>
      onDone(await OperaHub.createProfile(hub!, name.trim(), password)),
    );
  };

  const unlock = () => {
    if (!chosen || !password) return;
    run(async () =>
      onDone(await OperaHub.unlockProfile(hub!, chosen.id, password)),
    );
  };

  const savePassword = () => {
    const problem = passwordProblem();
    if (problem) return setError(problem);
    run(async () => {
      await OperaHub.changePassword(hub!, current, password);
      onClose();
    });
  };

  const help = (idle: string, working: string) =>
    busy ? working : (error ?? idle);

  const renderHighlight = (
    label: string,
    icon: number,
    disabled: boolean,
    onPress: () => void,
  ) => (
    <Group
      style={[
        styles.highlightGroup,
        (busy || disabled) && styles.highlightGroupDisabled,
      ]}
    >
      <ActionButton
        icon={icon}
        label={label}
        variant="highlight"
        disabled={busy || disabled}
        onPress={onPress}
      />
    </Group>
  );

  const renderPick = () => (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={styles.settingLabel}>{t("hubProfile.pickTitle")}</Text>
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
          {error ??
            (profiles === null
              ? t("hubProfile.loading")
              : profiles.length === 0
                ? t("hubProfile.none")
                : t("hubProfile.pickHelp"))}
        </Text>
        {!!profiles?.length && (
          <View style={styles.grid}>
            {profiles.map((profile) => (
              <Pressable
                key={profile.id}
                style={pressStyle(styles.gridCard, "fadeLight")}
                onPress={() => {
                  setChosen(profile);
                  showPage("unlock");
                }}
              >
                <ProfileCard
                  name={profile.name}
                  createdAt={profile.createdAt * 1000}
                  compact
                />
              </Pressable>
            ))}
          </View>
        )}
        {allowCreate && profiles !== null && (
          <Group>
            <ActionButton
              icon={newIcon}
              label={t("hubProfile.create")}
              onPress={() => showPage("create")}
            />
          </Group>
        )}
      </View>
    </View>
  );

  const renderUnlock = () =>
    chosen && (
      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <ProfileCard name={chosen.name} createdAt={chosen.createdAt * 1000} />
        </View>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("hubProfile.password")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {help(t("hubProfile.unlockHelp"), t("hubProfile.unlocking"))}
          </Text>
          <Group style={styles.groupSpacingTight}>
            <TextInputField
              icon={keyIcon}
              placeholder={t("hubProfile.passwordPlaceholder")}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={unlock}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Group>
          {renderHighlight(t("hubProfile.unlock"), keyIcon, !password, unlock)}
        </View>
      </View>
    );

  const renderPasswordFields = (onSubmit: () => void) => (
    <Group style={styles.groupSpacingTight}>
      <TextInputField
        icon={keyIcon}
        placeholder={t("hubProfile.passwordPlaceholder")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInputField
        icon={keyIcon}
        placeholder={t("hubProfile.confirmPlaceholder")}
        value={confirm}
        onChangeText={setConfirm}
        onSubmitEditing={onSubmit}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Group>
  );

  const renderCreate = () => (
    <View style={styles.contentCard}>
      <View style={styles.settingRowVertical}>
        <ProfileCard name={name} />
      </View>
      <View style={styles.settingRowVertical}>
        <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
          {t("hubProfile.name")}
        </Text>
        <Group>
          <TextInputField
            icon={penIcon}
            placeholder={t("hubProfile.namePlaceholder")}
            value={name}
            onChangeText={setName}
          />
        </Group>
      </View>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={styles.settingLabel}>{t("hubProfile.setPassword")}</Text>
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
          {help(t("hubProfile.setPasswordHelp"), t("hubProfile.creating"))}
        </Text>
        {renderPasswordFields(create)}
        {renderHighlight(
          t("hubProfile.create"),
          newIcon,
          !password || !confirm,
          create,
        )}
      </View>
    </View>
  );

  const renderLink = () => (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={styles.settingLabel}>{t("hubProfile.linkTitle")}</Text>
        <Text style={[styles.helpText, digits && { marginBottom: Spacing.md }]}>
          {error ??
            (digits ? t("hubProfile.linkHelp") : t("hubProfile.linkWaiting"))}
        </Text>
        {digits && !error && (
          <Group>
            <Text style={styles.digits}>{digits}</Text>
          </Group>
        )}
      </View>
    </View>
  );

  const renderPasswordChange = () => (
    <View style={styles.contentCard}>
      <View style={styles.settingRowVertical}>
        <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
          {t("hubProfile.currentPassword")}
        </Text>
        <Group>
          <TextInputField
            icon={keyIcon}
            placeholder={t("hubProfile.passwordPlaceholder")}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Group>
      </View>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={styles.settingLabel}>{t("hubProfile.newPassword")}</Text>
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
          {help(t("hubProfile.setPasswordHelp"), t("hubProfile.saving"))}
        </Text>
        {renderPasswordFields(savePassword)}
        {renderHighlight(
          t("hubProfile.savePassword"),
          keyIcon,
          !current || !password || !confirm,
          savePassword,
        )}
      </View>
    </View>
  );

  const renderPage = (p: Page, active: boolean) => (
    <>
      <SheetScrollView
        ref={active ? scrollRef : undefined}
        contentContainerStyle={[
          styles.content,
          parentOf(p) && styles.contentWithBack,
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={
          active
            ? (e) => setScrolled(e.nativeEvent.contentOffset.y > 4)
            : undefined
        }
        scrollEventThrottle={16}
      >
        {p === "pick" && renderPick()}
        {p === "unlock" && renderUnlock()}
        {p === "create" && renderCreate()}
        {p === "link" && renderLink()}
        {p === "password" && renderPasswordChange()}
      </SheetScrollView>

      {/* floats over the scroll like the settings back button */}
      {parentOf(p) && (
        <View style={styles.backWrapper} pointerEvents="box-none">
          <DrawerBackButton
            kind="back"
            onPress={handleBack}
            scrolled={scrolled}
            pulseKey={p}
          />
        </View>
      )}
    </>
  );

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      onBackPress={handleBack}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          //stacked pages cannot size the sheet
          height: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={[styles.desktopCard, { height: "100%" }]}
    >
      <SheetBody
        style={styles.body}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setBodyWidth((prev) => (prev !== width ? width : prev));
        }}
      >
        <PageStack
          page={page}
          visible={visible}
          width={bodyWidth}
          parentOf={parentOf}
          onBack={handleBack}
          renderPage={renderPage}
        />
      </SheetBody>
    </DrawerSheet>
  );
}

//same values as the settings sheets
const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      borderTopLeftRadius: Radius.huge2,
      borderTopRightRadius: Radius.huge2,
      paddingTop: Spacing.xxl,
      overflow: "hidden",
    },
    sheetHandleContainer: {
      //floats so top edge matches sides
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      paddingVertical: Spacing.md,
    },
    desktopCard: {
      width: DESKTOP_CARD_WIDTH,
    },
    body: {
      flex: 1,
    },
    content: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
    },
    //room for the floating back button
    contentWithBack: {
      paddingTop: 40 + Spacing.md,
    },
    backWrapper: {
      position: "absolute",
      top: Spacing.md + 4,
      left: Spacing.lg2,
      width: 40,
      height: 40,
      zIndex: 10,
      elevation: 10,
    },
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
      marginBottom: Spacing.xxl2,
    },
    settingRowVertical: {
      marginBottom: Spacing.xxl,
    },
    settingLabel: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    helpText: {
      fontSize: FontSizes.bodyMd,
      color: Colors.textMuted,
      fontFamily: Fonts.body,
      marginTop: Spacing.xs,
      lineHeight: 20,
      paddingHorizontal: Spacing.md,
    },
    groupSpacingTight: {
      marginBottom: Spacing.lg2,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    //two per row, a lone last card fills it
    gridCard: {
      flexGrow: 1,
      flexBasis: "40%",
      borderRadius: Radius.xl,
    },
    digits: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.xxxl,
      color: Colors.textPrimary,
      textAlign: "center",
      letterSpacing: Spacing.sm,
      paddingVertical: Spacing.xl2,
    },
  });
