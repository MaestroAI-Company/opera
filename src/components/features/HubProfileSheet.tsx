import { useEffect, useRef, useState } from "react";
import {
  ImageSourcePropType,
  Keyboard,
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
  HubDevice,
  HubProfile,
  hubErrorCode,
  OperaHub,
  PairedHub,
} from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import CardGrid, { GridCard } from "../ui/CardGrid";
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
const binIcon = require("../../../assets/icons/bin.png");
const profilIcon = require("../../../assets/icons/profil.png");
const phoneIcon = require("../../../assets/icons/phone.png");
const laptopIcon = require("../../../assets/icons/laptop.png");
const webIcon = require("../../../assets/icons/website.png");
const operaIcon = require("../../../assets/icons/operaicon.png");

const HUB_DEVICE_ICONS: Record<string, ImageSourcePropType> = {
  phone: phoneIcon,
  desktop: laptopIcon,
  web: webIcon,
};

const KINDS = ["phone", "desktop", "web"] as const;
type DeviceKind = (typeof KINDS)[number] | "other";

const DESKTOP_CARD_WIDTH = 720;
const DESKTOP_CARD_WIDTH_NARROW = 560;
//shorter passwords fall to a guessing hub
export const MIN_PASSWORD_LENGTH = 8;

type Page = "pick" | "create" | "unlock" | "link" | "profile" | "password";

type HubProfileSheetProps = {
  visible: boolean;
  hub: PairedHub | null;
  //onboarding restores, settings may also create
  allowCreate?: boolean;
  //prefilled name of a new profile
  defaultName?: string;
  //opens on the password change instead
  changePassword?: boolean;
  //target profile shown in drawer
  profile?: HubProfile | null;
  //hub devices of the profile
  devices?: HubDevice[] | null;
  //identify active device
  thisDeviceId?: string | null;
  //show password action for self
  isSelf?: boolean;
  //admins can manage other profiles
  canManage?: boolean;
  onClose: () => void;
  onDone: (profile: HubProfile) => void;
  onSelectDevice?: (device: HubDevice) => void;
  onToggleRole?: (profile: HubProfile) => void;
  onRemoveProfile?: (profile: HubProfile) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//navigate up stack
const parentOf = (page: Page): Page | null => {
  if (page === "create" || page === "unlock" || page === "link") return "pick";
  if (page === "password") return "profile";
  return null;
};

//pick, create, unlock or link a profile on a sampler
export default function HubProfileSheet({
  visible,
  hub,
  allowCreate = true,
  defaultName = "",
  changePassword = false,
  profile: profileProp = null,
  devices: devicesProp = null,
  thisDeviceId: thisDeviceIdProp = null,
  isSelf: isSelfProp,
  canManage = false,
  onClose,
  onDone,
  onSelectDevice,
  onToggleRole,
  onRemoveProfile,
  isLargeScreen = false,
  isDesktop = false,
}: HubProfileSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>("pick");
  const [bodyWidth, setBodyWidth] = useState(0);
  const [selfProfile, setSelfProfile] = useState<HubProfile | null>(null);
  const [loadedDevices, setLoadedDevices] = useState<HubDevice[] | null>(null);
  const [loadedDeviceId, setLoadedDeviceId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<HubProfile[] | null>(null);
  const [chosen, setChosen] = useState<HubProfile | null>(null);
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [digits, setDigits] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  //parents pass a fresh callback each render
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const effectiveProfile = profileProp ?? selfProfile;
  const effectiveDevices = devicesProp ?? loadedDevices;
  const effectiveThisDeviceId = thisDeviceIdProp ?? loadedDeviceId;
  const effectiveIsSelf =
    isSelfProp !== undefined
      ? isSelfProp
      : !effectiveProfile || !selfProfile || effectiveProfile.id === selfProfile.id;

  //each opening starts clean
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPage(changePassword ? "password" : profileProp ? "profile" : "pick");
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

  const [prevProfile, setPrevProfile] = useState(profileProp);
  if (profileProp !== prevProfile) {
    setPrevProfile(profileProp);
    if (profileProp) {
      setPage("profile");
      setPassword("");
      setConfirm("");
      setCurrent("");
      setError(null);
    }
  }

  //fetch profile when omitted
  useEffect(() => {
    if (!visible || profileProp) return;
    OperaHub.getProfile().then((p) => {
      if (p) setSelfProfile(p);
    });
  }, [visible, profileProp]);

  //fetch devices when omitted
  useEffect(() => {
    if (!visible || !hub || devicesProp) return;
    OperaHub.devices(hub).then(setLoadedDevices).catch(() => null);
  }, [visible, hub, devicesProp]);

  //fetch device id when omitted
  useEffect(() => {
    if (!visible || thisDeviceIdProp) return;
    OperaHub.deviceId().then(setLoadedDeviceId).catch(() => null);
  }, [visible, thisDeviceIdProp]);

  //a link code joins at once, an admin code lists profiles
  useEffect(() => {
    if (!visible || !hub || changePassword || profileProp) return;
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
  }, [visible, hub, changePassword, profileProp, t]);

  const showPage = (next: Page) => {
    Keyboard.dismiss();
    setScrolled(false);
    setError(null);
    setPassword("");
    setConfirm("");
    setPage(next);
  };

  const handleBack = () => {
    const parent = parentOf(page);
    if (!parent || busy) return false;
    Keyboard.dismiss();
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
      setPassword("");
      setConfirm("");
      setCurrent("");
      showPage("profile");
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
                style={pressStyle([styles.gridCard, isDesktop && styles.gridCardDesktop], "fadeLight")}
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

  const renderProfileView = () => {
    const target = effectiveProfile;
    if (!target) return null;

    const profileDevices = (effectiveDevices ?? []).filter((d) => d.profile === target.id);
    const deviceCards: GridCard[] = profileDevices.map((device) => {
      const kind: DeviceKind = KINDS.find((k) => k === device.kind) ?? "other";
      const icon = HUB_DEVICE_ICONS[device.kind] ?? operaIcon;
      const status =
        device.id === effectiveThisDeviceId
          ? t("settings.hub.thisDevice")
          : t(`hubDevice.kinds.${kind}`);
      return {
        key: device.id,
        title: device.name,
        icon,
        status,
        onPress: onSelectDevice ? () => onSelectDevice(device) : undefined,
      };
    });

    return (
      <>
        {/* profile card */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <ProfileCard name={target.name} createdAt={target.createdAt ? target.createdAt * 1000 : undefined} />
          </View>
        </View>

        {/* devices section */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.hub.devices")}
            </Text>
            {deviceCards.length > 0 ? (
              <CardGrid cards={deviceCards} minCardWidth={140} />
            ) : (
              <Text style={styles.helpText}>{t("hubProfile.noDevices")}</Text>
            )}
          </View>
        </View>

        {/* actions section */}
        {(effectiveIsSelf || (canManage && !effectiveIsSelf)) && (
          <View style={[styles.contentCard, { marginBottom: 0 }]}>
            <Group>
              {effectiveIsSelf && (
                <ActionButton
                  icon={keyIcon}
                  label={t("hubProfile.changeMyPassword")}
                  onPress={() => showPage("password")}
                />
              )}
              {!effectiveIsSelf && canManage && (
                <>
                  <ActionButton
                    icon={profilIcon}
                    label={
                      target.role === "admin"
                        ? t("sampler.profile.makeMember")
                        : t("sampler.profile.makeAdmin")
                    }
                    onPress={() => onToggleRole?.(target)}
                  />
                  <ActionButton
                    icon={binIcon}
                    label={t("sampler.profile.remove")}
                    onPress={() => onRemoveProfile?.(target)}
                  />
                </>
              )}
            </Group>
          </View>
        )}
      </>
    );
  };

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
        {p === "profile" && renderProfileView()}
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
          //stacked pages need fixed height
          height: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      //desktop card fills drawer height
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
    body: {
      flex: 1,
    },
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
    desktopCardNarrow: {
      width: DESKTOP_CARD_WIDTH_NARROW,
    },
    content: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
    },
    //room for the floating back button
    contentWithBack: {
      paddingTop: 40 + Spacing.xxl,
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
    //two per row, three on desktop, a lone last card fills it
    gridCard: {
      flexGrow: 1,
      flexBasis: "40%",
      borderRadius: Radius.xl,
    },
    gridCardDesktop: {
      flexBasis: "30%",
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
