import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  BackHandler,
  Image,
  ImageSourcePropType,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FontSizes,
  Fonts,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { useHubModels } from "../../hooks/useHubModels";
import { useResponsive } from "../../hooks/useResponsive";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { getLocale, useT } from "../../i18n";
import { formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import {
  HUB_PROVIDER_ID,
  getEnabledProviders,
  serializeProviders,
} from "../../services/ai/providers/sources";
import { HubSync } from "../../services/hub/HubSync";
import {
  HostStatus,
  HubDevice,
  HubProfile,
  HubSettings,
  HubStatus,
  McpAction,
  McpServerSummary,
  PairedHub,
  SamplerHub,
  hubErrorCode,
  hubErrorText,
} from "../../services/hub/SamplerHubService";
import {
  CTX_SIZE_OPTIONS,
  KEEP_ALIVE_OPTIONS,
  PARALLEL_OPTIONS,
} from "../../services/hub/modelOptions";
import { Settings } from "../../services/settings/SettingsService";
import ActionButton from "../ui/ActionButton";
import CardGrid, { type GridCard } from "../ui/CardGrid";
import FloatingButton from "../ui/FloatingButton";
import Group from "../ui/Group";
import MetricChart, { CHART_POINTS } from "../ui/MetricChart";
import NotificationModal, { type ModalButton } from "../ui/NotificationModal";
import Slider from "../ui/Slider";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import { pressStyle } from "../ui/pressStyle";
import DrawerBackButton from "./DrawerBackButton";
import DrawerSheet, {
  SheetKeyboardAwareScrollView,
  SheetScrollView,
} from "./DrawerSheet";
import HubDeviceSheet from "./HubDeviceSheet";
import HubOrbit, { type OrbitNode } from "./HubOrbit";
import HubSheet from "./HubSheet";
import HubMcpSection, { HubMcpServerPage } from "./HubMcpSection";
import HubMcpSheet, { HubFolderSheet } from "./HubMcpSheet";
import HubModelsSection, { HubModelPage } from "./HubModelsSection";
import HubModelsSheet from "./HubModelsSheet";
import HubPairingSheet from "./HubPairingSheet";
import HubProfileSheet from "./HubProfileSheet";
import HubQrSheet from "./HubQrSheet";
import PageStack from "./PageStack";
import ProfileCard from "./ProfileCard";
import {
  dragDrawer,
  drawerWidthFor,
  gestureVelocity,
  releaseOpens,
  samplerDrawerProgress,
  settleDrawer,
  useDockedWidth,
} from "./drawerAnimation";

const homeIcon = require("../../../assets/icons/home.png");
const profilIcon = require("../../../assets/icons/profil.png");
const botIcon = require("../../../assets/icons/bot.png");
const toolIcon = require("../../../assets/icons/tool.png");
const settingsIcon = require("../../../assets/icons/settings.png");
const addIcon = require("../../../assets/icons/add.png");
const reconnectIcon = require("../../../assets/icons/reconnect.png");
const downloadIcon = require("../../../assets/icons/download.png");
const cancelIcon = require("../../../assets/icons/cancel.png");
const binIcon = require("../../../assets/icons/bin.png");
const serverIcon = require("../../../assets/icons/server.png");
const operaIcon = require("../../../assets/icons/operaicon.png");
const messageIcon = require("../../../assets/icons/message.png");
const timeIcon = require("../../../assets/icons/time.png");
const tilesIcon = require("../../../assets/icons/tiles.png");
const quickIcon = require("../../../assets/icons/Quick.png");
const stopIcon = require("../../../assets/icons/stop.png");
const activateIcon = require("../../../assets/icons/activate.png");

const HUB_DEVICE_ICONS: Record<string, ImageSourcePropType> = {
  phone: require("../../../assets/icons/phone.png"),
  desktop: require("../../../assets/icons/laptop.png"),
  web: require("../../../assets/icons/website.png"),
};
const HUB_INACTIVE_AFTER_S = 30 * 24 * 60 * 60;
//a device seen this recently counts as connected
const HUB_CONNECTED_WITHIN_S = 120;
const USAGE_POLL_MS = 5000;
//a connected hub answers far sooner
const STATUS_TIMEOUT_MS = 8000;
//show offline before client timeout
const answerWithin = <T,>(answer: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silent = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("no answer")), STATUS_TIMEOUT_MS);
  });
  return Promise.race([answer, silent]).finally(() => clearTimeout(timer));
};
const OVERVIEW_POLL_MS = 10000;
//same column as the chat: 840 wide with 16 on each side
const PAGE_MAX_WIDTH = 840 - 2 * Spacing.xl2;
const TILE_MIN_WIDTH = 150;
//slider beside its text on desktop
const SLIDER_WIDTH = 320;
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
//title bar, then the top bar and its padding
const CONTENT_TOP = (isTauri ? 32 : 0) + 60 + Spacing.xl2;

type Page =
  | "home"
  | "profiles"
  | "models"
  | "mcp"
  | "performance"
  | "preferences";
//pages pushed from a section page
type SubPage = Page | "profile";
type Detail = { file: string; name: string };
type HubState = "checking" | "online" | "offline" | "revoked" | "outdated";

const failedState = (e: unknown): HubState => {
  const code = hubErrorCode(e);
  return code === "Unauthorized"
    ? "revoked"
    : code === "Outdated"
      ? "outdated"
      : "offline";
};
type Modal = {
  title: string;
  message?: string;
  buttons: ModalButton[];
  loading?: boolean;
};

type SamplerScreenProps = {
  visible?: boolean;
  transitionProgress?: Animated.Value;
  mainTranslateX?: Animated.AnimatedInterpolation<number>;
  isLargeScreen: boolean;
  isDesktop: boolean;
  drawerVisible?: boolean;
  onCloseDrawer?: () => void;
  onOpenChat?: () => void;
  //after each reload, pairing or role may have changed
  onHubChanged?: () => void;
  onReadyChange?: (ready: boolean) => void;
};

const message = hubErrorText;

const PARENT: Partial<Record<SubPage, SubPage>> = {
  profile: "profiles",
};

const parentOf = (page: SubPage): SubPage | null => PARENT[page] ?? null;

//the nav item a page belongs to
const sectionOf = (page: SubPage): Page => {
  const parent = parentOf(page);
  return parent ? sectionOf(parent) : (page as Page);
};

//admin page of the sampler, desktop app and admin browsers
export default function SamplerScreen({
  visible = true,
  transitionProgress,
  mainTranslateX,
  isLargeScreen,
  isDesktop,
  drawerVisible = false,
  onCloseDrawer,
  onOpenChat,
  onHubChanged,
  onReadyChange,
}: SamplerScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useResponsive();
  const drawerWidth = drawerWidthFor(windowWidth);
  const sheetMaxHeight = windowHeight - insets.top - Spacing.xl2;
  const contentTop =
    (isDesktop ? (isTauri ? 32 : 0) : insets.top) + 60 + Spacing.xl2;

  const [page, setPage] = useState<SubPage>("home");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selectedMcpServerId, setSelectedMcpServerId] = useState<string | null>(
    null,
  );
  const [myMcpDetail, setMyMcpDetail] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [drawerScrolled, setDrawerScrolled] = useState(false);
  const [stackWidth, setStackWidth] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [pairedHub, setPairedHub] = useState<PairedHub | null>(null);
  const [hubState, setHubState] = useState<HubState>("checking");
  const [status, setStatus] = useState<HubStatus | null>(null);
  //last hub answer this session
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  //last usage samples for the performance graphs
  const [usageHistory, setUsageHistory] = useState<{
    cpu: number[];
    memory: number[];
    received: number;
  }>({
    cpu: [],
    memory: [],
    received: 0,
  });
  const [devices, setDevices] = useState<HubDevice[] | null>(null);
  //when the device list was read, for the inactive flag
  const [devicesAt, setDevicesAt] = useState(0);
  const [profiles, setProfiles] = useState<HubProfile[] | null>(null);
  //this device's profile
  const [profile, setProfile] = useState<HubProfile | null>(null);
  //null without the admin scope
  const [settings, setSettings] = useState<HubSettings | null>(null);
  const [hostStatus, setHostStatus] = useState<HostStatus | null>(null);
  const [hostBusy, setHostBusy] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [overview, setOverview] = useState<McpServerSummary[] | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [registries, setRegistries] = useState<string[] | null>(null);
  const [registryDraft, setRegistryDraft] = useState("");
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [profileSheet, setProfileSheet] = useState<
    "pick" | "view" | "password" | null
  >(null);
  const [selectedProfile, setSelectedProfile] = useState<HubProfile | null>(
    null,
  );
  const [pairingVisible, setPairingVisible] = useState(false);
  const [qrMode, setQrMode] = useState<"invite" | "link" | null>(null);
  const [hubSheetVisible, setHubSheetVisible] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [modelsSheetVisible, setModelsSheetVisible] = useState(false);
  const [mcpSheetVisible, setMcpSheetVisible] = useState(false);
  const [modelSettingsVisible, setModelSettingsVisible] = useState(false);
  const [folderPick, setFolderPick] = useState<{
    start?: string;
    done: (path: string) => void;
  } | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);

  //every answer also feeds the graphs
  const receiveStatus = useCallback((next: HubStatus) => {
    setStatus(next);
    setLastSeen(Date.now());
    if (next.memory == null) return;
    setUsageHistory((prev) => ({
      cpu: [...prev.cpu, next.cpu ?? 0].slice(-CHART_POINTS),
      memory: [...prev.memory, next.memory ?? 0].slice(-CHART_POINTS),
      received: prev.received + 1,
    }));
  }, []);

  const refresh = useCallback(async () => {
    const hub = await SamplerHub.getPairedHub();
    setPairedHub(hub);
    setProfile(await SamplerHub.getProfile());
    setHostStatus(
      SamplerHub.canHost()
        ? await SamplerHub.hostStatus().catch(() => null)
        : null,
    );
    setLoaded(true);
    if (!hub) return;
    SamplerHub.deviceId()
      .then(setThisDeviceId)
      .catch(() => setThisDeviceId(null));
    try {
      receiveStatus(await answerWithin(SamplerHub.status(hub)));
      setHubState("online");
      const [nextDevices, nextProfiles, nextSettings] = await Promise.all([
        SamplerHub.devices(hub).catch(() => null),
        SamplerHub.profiles(hub).catch(() => null),
        SamplerHub.hubSettings(hub).catch(() => null),
      ]);
      setDevices(nextDevices);
      setDevicesAt(Date.now() / 1000);
      setProfiles(nextProfiles);
      setSettings(nextSettings);
    } catch (e) {
      setHubState(failedState(e));
    } finally {
      //the switch follows pairing and role
      onHubChanged?.();
    }
  }, [onHubChanged, receiveStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the paired hub
    refresh();
  }, [refresh]);

  //usage stays live while the screen shows
  useEffect(() => {
    if (!visible || !pairedHub || hubState === "checking") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      //local hub may have stopped
      if (SamplerHub.canHost()) {
        SamplerHub.hostStatus()
          .then((next) => live && setHostStatus(next))
          .catch(() => {});
      }
      answerWithin(SamplerHub.status(pairedHub))
        .then((next) => {
          if (!live) return;
          if (hubState === "online") return receiveStatus(next);
          //returning hub reloads everything
          return refresh();
        })
        .catch((e) => live && setHubState(failedState(e)))
        //one check at a time
        .finally(() => {
          if (live) timer = setTimeout(check, USAGE_POLL_MS);
        });
    };
    timer = setTimeout(check, USAGE_POLL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, pairedHub, hubState, refresh, receiveStatus]);

  //the role may have changed since the profile was unlocked
  const role =
    profiles?.find((p) => p.id === profile?.id)?.role ?? profile?.role;
  const isAdmin = role === "admin";
  const online = hubState === "online";
  //hosting is desktop-only
  const canHost = SamplerHub.canHost();
  const hostsHub =
    canHost && !!hostStatus?.id && pairedHub?.id === hostStatus.id;
  //unpair would cut its own host
  const hostedHere = hostsHub && !!hostStatus?.running;
  const showModels = isAdmin && SamplerHub.canManageModels();
  //llama.cpp usage and build for these pages
  const { status: modelsStatus } = useHubModels(
    visible &&
      online &&
      showModels &&
      (page === "performance" || page === "models"),
  );
  //every profile's servers on desktop, personal servers on mobile
  const showMcpOverview = isAdmin && SamplerHub.canSeeMcpServers();
  const canManageMcp = SamplerHub.canManageMcp();
  const showMcp = showMcpOverview || canManageMcp;

  //the home orbit shows who is connected now
  useEffect(() => {
    if (!visible || page !== "home" || !online || !pairedHub) return;
    let live = true;
    const timer = setInterval(() => {
      SamplerHub.devices(pairedHub)
        .then((next) => {
          if (!live) return;
          setDevices(next);
          setDevicesAt(Date.now() / 1000);
        })
        .catch(() => {});
    }, OVERVIEW_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [visible, page, online, pairedHub]);

  //read only, on home, performance and its pages
  useEffect(() => {
    if (
      !visible ||
      (page !== "home" &&
        page !== "performance" &&
        sectionOf(page) !== "mcp") ||
      !showMcpOverview ||
      !online ||
      !pairedHub
    )
      return;
    let live = true;
    const load = () =>
      SamplerHub.mcpOverview(pairedHub)
        .then((servers) => {
          if (!live) return;
          setOverview(servers);
          setOverviewError(null);
        })
        .catch((e) => live && setOverviewError(message(e)));
    //let the page slide finish before updating state
    const startTimer = setTimeout(load, 300);
    const timer = setInterval(load, OVERVIEW_POLL_MS);
    return () => {
      live = false;
      clearTimeout(startTimer);
      clearInterval(timer);
    };
  }, [visible, page, showMcpOverview, online, pairedHub]);

  useEffect(() => {
    if (page !== "preferences" || !isAdmin || !online) return;
    SamplerHub.mcp()
      .then((api) => api.registries())
      .then(setRegistries)
      .catch(() => setRegistries(null));
  }, [page, isAdmin, online]);

  const closeModal = () => setModal(null);

  const showError = (e: unknown) =>
    setModal({
      title: t("sampler.failed"),
      message: message(e),
      buttons: [
        { text: t("common.ok"), style: "secondary", onPress: closeModal },
      ],
    });

  //first time only, later the toggle turns it on and off
  const startHosting = async () => {
    setHostBusy(true);
    setHostError(null);
    try {
      //a hub left running only needs pairing
      if (!hostStatus?.running) await SamplerHub.setHosting(true);
    } catch (e) {
      console.warn("[Sampler] hosting failed:", e);
      setHostError(t("settings.hub.hostFailed"));
      setHostBusy(false);
      return;
    }
    try {
      await SamplerHub.pairWithThisComputer();
      setProfileSheet("pick");
    } catch (e) {
      setHostError(t(`hubPairing.error.${hubErrorCode(e)}`));
    } finally {
      setHostBusy(false);
      //same check as the connection button
      setHubState("checking");
      refresh();
    }
  };

  const setHosting = async (on: boolean) => {
    setHostBusy(true);
    setHostError(null);
    try {
      await SamplerHub.setHosting(on);
    } catch (e) {
      console.warn("[Sampler] hosting failed:", e);
      setHostError(t("settings.hub.hostFailed"));
    } finally {
      setHostBusy(false);
      await refresh();
    }
  };

  //same as joining from the settings
  const handleProfileDone = (next: HubProfile) => {
    setProfileSheet(null);
    setProfile(next);
    refresh();
    const enabled = getEnabledProviders();
    if (!enabled.includes(HUB_PROVIDER_ID)) {
      Settings.set(
        "enabledProviders",
        serializeProviders([...enabled, HUB_PROVIDER_ID]),
      );
    }
    HubSync.joinedProfile().catch((e) =>
      console.warn("[HubSync] first sync failed:", e),
    );
  };

  const changeSettings = async (patch: Partial<HubSettings>) => {
    if (!pairedHub || !settings) return;
    const wanted = { ...settings, ...patch };
    setSettings(wanted);
    try {
      setSettings(await SamplerHub.setHubSettings(pairedHub, wanted));
    } catch (e) {
      console.warn("[Sampler] hub settings not saved:", e);
      setSettings(settings);
    }
  };

  const installUpdate = async (version: string) => {
    if (!pairedHub) return;
    try {
      await SamplerHub.updateHub(pairedHub, version);
    } catch (e) {
      setModal({
        title: t("hubUpdate.title"),
        message: t("hubUpdate.failed", { error: message(e) }),
        buttons: [
          { text: t("common.ok"), style: "secondary", onPress: closeModal },
        ],
      });
    }
  };

  const unpair = () => {
    if (!pairedHub || hostedHere) return;
    setModal({
      title: t("settings.hub.unpairTitle"),
      message: t("settings.hub.unpairMessage", { name: pairedHub.name }),
      buttons: [
        { text: t("common.cancel"), style: "secondary", onPress: closeModal },
        {
          text: t("settings.hub.unpair"),
          style: "danger",
          onPress: async () => {
            //an unreachable hub takes a few seconds
            setModal((shown) => shown && { ...shown, loading: true });
            await SamplerHub.unpair(pairedHub);
            await HubSync.forgetHub();
            closeModal();
            setPage("home");
            setDetail(null);
            setSelectedMcpServerId(null);
            setMyMcpDetail(null);
            setProfile(null);
            setStatus(null);
            setLastSeen(null);
            setDevices(null);
            setProfiles(null);
            refresh();
          },
        },
      ],
    });
  };

  //admin actions ask the hub, then reload the lists
  const runAdmin = async (action: () => Promise<void>) => {
    closeModal();
    try {
      await action();
    } catch (e) {
      showError(e);
    }
    refresh();
  };

  const roleLabel = (value: HubProfile["role"]) =>
    value === "admin"
      ? t("settings.hub.roleAdmin")
      : t("settings.hub.roleMember");

  const confirmRemoveProfile = (target: HubProfile) =>
    setModal({
      title: t("sampler.profile.removeTitle", { name: target.name }),
      message: t("sampler.profile.removeMessage"),
      buttons: [
        { text: t("common.cancel"), style: "secondary", onPress: closeModal },
        {
          text: t("sampler.profile.remove"),
          style: "danger",
          onPress: () => {
            //its page has nothing left to show
            openPage("profiles");
            runAdmin(() => SamplerHub.removeProfile(pairedHub!, target.id));
          },
        },
      ],
    });

  const openProfile = (target: HubProfile) => {
    if (
      target.id !== profile?.id &&
      (!isAdmin || !pairedHub || !SamplerHub.canManageProfiles())
    )
      return;
    setProfileId(target.id);
    setSelectedProfile(target);
    setProfileSheet("view");
  };

  const saveRegistries = async (urls: string[]) => {
    setRegistryError(null);
    try {
      const api = await SamplerHub.mcp();
      setRegistries(await api.setRegistries(urls));
      setRegistryDraft("");
    } catch (e) {
      setRegistryError(t("sampler.registryFailed", { error: message(e) }));
    }
  };

  const confirmRemoveRegistry = (url: string) =>
    setModal({
      title: t("sampler.registryRemoveTitle"),
      message: url,
      buttons: [
        { text: t("common.cancel"), style: "secondary", onPress: closeModal },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: () => {
            closeModal();
            saveRegistries((registries ?? []).filter((r) => r !== url));
          },
        },
      ],
    });

  //a device paired without a profile yet has none
  const ownerName = (id?: string | null) =>
    profiles?.find((p) => p.id === id)?.name ?? t("sampler.noProfile");

  //every page opens at the top
  const openPage = (next: SubPage) => {
    setPage(next);
    setScrolled(false);
  };

  const renderToggleRow = (
    label: string,
    help: string,
    checked: boolean,
    onToggle: (value: boolean) => void,
    last = true,
    lit = false,
  ) => (
    <View style={[styles.settingRowVertical, last && { marginBottom: 0 }]}>
      <View style={styles.toggleGroupRow}>
        <View style={styles.toggleGroupContent}>
          <Text style={[styles.settingLabel, lit && styles.litText]}>
            {label}
          </Text>
          <Text style={[styles.helpText, lit && styles.litText]}>{help}</Text>
        </View>
        <Toggle checked={checked} onToggle={onToggle} />
      </View>
    </View>
  );

  //stopped from preferences, started again from its page
  const hubStopped = hostsHub && !hostStatus?.running;

  const confirmStop = () =>
    setModal({
      title: t("sampler.stopTitle"),
      message: t("sampler.stopMessage"),
      buttons: [
        { text: t("common.cancel"), style: "secondary", onPress: closeModal },
        {
          text: t("sampler.stop"),
          style: "danger",
          onPress: async () => {
            setModal(
              (shown) =>
                shown && {
                  ...shown,
                  message: t("sampler.stopping"),
                  loading: true,
                },
            );
            await setHosting(false);
            //told once, not on every return to the screen
            setModal({
              title: t("sampler.stopped"),
              message: t("sampler.stoppedHelp"),
              buttons: [
                {
                  text: t("common.ok"),
                  style: "secondary",
                  onPress: closeModal,
                },
              ],
            });
          },
        },
      ],
    });

  //hub out of reach, a page of its own
  const renderStopped = () => {
    const connection = {
      checking: t("settings.hub.checking"),
      offline: t("settings.hub.offline"),
      revoked: t("settings.hub.revoked"),
      outdated: t("settings.hub.outdated"),
      online: "",
    }[hubState];
    const seen =
      hubState === "offline" && lastSeen
        ? t("sampler.lastSeen", {
            time: new Intl.DateTimeFormat(getLocale(), {
              hour: "numeric",
              minute: "2-digit",
            }).format(lastSeen),
          })
        : null;
    return (
      <View style={styles.welcome}>
        <Text style={styles.welcomeText}>{pairedHub?.name}</Text>
        <Text style={styles.welcomeHelp}>
          {hostError ??
            (hubStopped
              ? t("sampler.stopped")
              : [connection, seen].filter(Boolean).join(" · "))}
        </Text>
        <View style={styles.welcomeAction}>
          <Group>
            {hubStopped && (
              <ActionButton
                icon={activateIcon}
                label={t("sampler.start")}
                disabled={hostBusy}
                onPress={() => {
                  setHubState("checking");
                  setHosting(true);
                }}
              />
            )}
            <ActionButton
              icon={reconnectIcon}
              label={t("settings.hub.check")}
              disabled={hubState === "checking"}
              onPress={() => {
                setHubState("checking");
                refresh();
              }}
            />
            <ActionButton
              icon={cancelIcon}
              label={t("settings.hub.unpair")}
              onPress={unpair}
            />
          </Group>
        </View>
      </View>
    );
  };

  const shownProfiles = profiles ?? (profile ? [profile] : []);
  //two cards per row
  const profileRows = useMemo(() => {
    const rows: HubProfile[][] = [];
    for (let i = 0; i < shownProfiles.length; i += 2) {
      rows.push(shownProfiles.slice(i, i + 2));
    }
    return rows;
  }, [shownProfiles]);
  const renderProfilesCard = (withActions: boolean) => (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={styles.settingLabel}>{t("sampler.profiles")}</Text>
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
          {t("sampler.profilesHelp")}
        </Text>
        <View style={styles.profileTiles}>
          {profileRows.map((row) => (
            <View key={row[0].id} style={styles.profileRow}>
              {row.map((p) => (
                <Pressable
                  key={p.id}
                  style={pressStyle(styles.profileTile, "fadeLight")}
                  onPress={() => openProfile(p)}
                >
                  <ProfileCard
                    name={p.name}
                    createdAt={p.createdAt * 1000}
                    compact
                  />
                </Pressable>
              ))}
              {row.length === 1 && (
                <View style={styles.profileTilePlaceholder} />
              )}
            </View>
          ))}
        </View>
        {withActions && isAdmin && (
          <Group style={{ marginTop: Spacing.md }}>
            <ActionButton
              icon={profilIcon}
              label={t("settings.hub.pairDevice")}
              onPress={() => setQrMode("invite")}
            />
          </Group>
        )}
      </View>
    </View>
  );

  const deviceTiles: GridCard[] = (devices ?? []).map((device) => {
    const seen =
      device.id === thisDeviceId
        ? t("settings.hub.thisDevice")
        : device.lastSeen && devicesAt - device.lastSeen > HUB_INACTIVE_AFTER_S
          ? t("settings.hub.inactive")
          : null;
    return {
      key: device.id,
      icon: HUB_DEVICE_ICONS[device.kind] ?? operaIcon,
      title: device.name,
      status: [ownerName(device.profile), seen].filter(Boolean).join(" · "),
      onPress:
        isAdmin || device.id === thisDeviceId
          ? () => setSelectedDeviceId(device.id)
          : undefined,
    };
  });

  //home shows it without its actions
  const renderDevicesCard = (withActions: boolean) => (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
          {t("settings.hub.devices")}
        </Text>
        {devices ? (
          <CardGrid
            cards={deviceTiles}
            minCardWidth={TILE_MIN_WIDTH}
            style={withActions && { marginBottom: Spacing.md }}
          />
        ) : (
          <Text
            style={[
              styles.helpText,
              withActions && { marginBottom: Spacing.md },
            ]}
          >
            {t("settings.hub.devicesEmpty")}
          </Text>
        )}
        {/* same actions as the settings hub page */}
        {withActions && (
          <Group>
            <ActionButton
              icon={addIcon}
              label={t("settings.hub.addMyDevice")}
              onPress={() => setQrMode("link")}
            />
          </Group>
        )}
      </View>
    </View>
  );

  const modelsSection = () => (
    <HubModelsSection
      onOpenModel={(file, name) => setDetail({ file, name })}
    />
  );

  const myMcpSection = () => (
    <HubMcpSection
      onOpenServer={(id, title) => setMyMcpDetail({ id, title })}
    />
  );

  const serverStatus = (server: McpServerSummary) =>
    [
      server.state === "running"
        ? t("hubMcp.state.running", { count: server.tools })
        : t(`hubMcp.state.${server.state}`),
      server.memory != null ? formatBytes(server.memory) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const runMcp = async (id: string, action: McpAction) => {
    closeModal();
    if (!pairedHub) return;
    try {
      setOverview(await SamplerHub.mcpManage(pairedHub, id, action));
    } catch (e) {
      showError(e);
    }
  };

  //one switch per profile starts or stops all its servers
  const switchServers = async (servers: McpServerSummary[], on: boolean) => {
    if (!pairedHub) return;
    try {
      for (const server of servers.filter((s) => s.enabled !== on)) {
        setOverview(
          await SamplerHub.mcpManage(
            pairedHub,
            server.id,
            on ? "start" : "stop",
          ),
        );
      }
    } catch (e) {
      showError(e);
    }
  };

  const confirmRemoveServer = (server: McpServerSummary, owner: string) =>
    setModal({
      title: t("sampler.mcpRemoveTitle", { name: server.title }),
      message: t("sampler.mcpRemoveMessage", { owner }),
      buttons: [
        { text: t("common.cancel"), style: "secondary", onPress: closeModal },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: () => {
            setSelectedMcpServerId(null);
            runMcp(server.id, "remove");
          },
        },
      ],
    });

  //servers from before profiles belong to admins
  const ownerOf = (server: McpServerSummary) =>
    server.owner ?? profiles?.find((p) => p.role === "admin")?.id;

  //an admin runs anyone's server, its settings stay private
  const renderMcpServer = () => {
    const server = overview?.find((s) => s.id === selectedMcpServerId);
    if (!server) return null;
    const owner = ownerName(ownerOf(server));
    const rows = [
      { label: t("settings.hub.profile"), value: owner },
      {
        label: t("sampler.mcpState"),
        value:
          server.state === "running"
            ? t("hubMcp.state.running", { count: server.tools })
            : t(`hubMcp.state.${server.state}`),
      },
      ...(server.cpu != null
        ? [
            {
              label: t("hubMcp.cpu"),
              value: t("hubMcp.cpuValue", { value: Math.round(server.cpu) }),
            },
          ]
        : []),
      ...(server.memory != null
        ? [{ label: t("hubMcp.memory"), value: formatBytes(server.memory) }]
        : []),
    ];
    return (
      <>
        <View style={styles.contentCard}>
          <Group style={styles.infoGroup}>
            {rows.map((row) => (
              <ActionButton
                key={row.label}
                label={row.label}
                rightElement={
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {row.value}
                  </Text>
                }
              />
            ))}
          </Group>
        </View>

        {/* actions section */}
        <View style={[styles.contentCard, { marginBottom: 0 }]}>
          <Group>
            <ActionButton
              icon={server.enabled ? stopIcon : activateIcon}
              label={
                server.enabled ? t("sampler.mcpStop") : t("sampler.mcpStart")
              }
              onPress={() =>
                runMcp(server.id, server.enabled ? "stop" : "start")
              }
            />
            {server.enabled && (
              <ActionButton
                icon={reconnectIcon}
                label={t("sampler.mcpRestart")}
                onPress={() => runMcp(server.id, "restart")}
              />
            )}
            <ActionButton
              icon={binIcon}
              label={t("common.remove")}
              onPress={() => confirmRemoveServer(server, owner)}
            />
          </Group>
        </View>
      </>
    );
  };

  //one profile, its role and removal
  const renderProfile = () => {
    const target = profiles?.find((p) => p.id === profileId);
    if (!target || !pairedHub) return null;
    const targetDevices = (devices ?? []).filter(
      (d) => d.profile === target.id,
    );
    const count = targetDevices.length;
    const nextRole = target.role === "admin" ? "member" : "admin";
    const targetDeviceTiles: GridCard[] = targetDevices.map((d) => {
      const seen =
        d.id === thisDeviceId
          ? t("settings.hub.thisDevice")
          : d.lastSeen && devicesAt - d.lastSeen > HUB_INACTIVE_AFTER_S
            ? t("settings.hub.inactive")
            : null;
      const kind =
        d.kind in HUB_DEVICE_ICONS
          ? (d.kind as "phone" | "desktop" | "web")
          : "other";
      return {
        key: d.id,
        icon: HUB_DEVICE_ICONS[d.kind] ?? operaIcon,
        title: d.name,
        status: [seen ?? t(`hubDevice.kinds.${kind}`)]
          .filter(Boolean)
          .join(" · "),
        onPress:
          isAdmin || d.id === thisDeviceId
            ? () => setSelectedDeviceId(d.id)
            : undefined,
      };
    });
    return (
      <>
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <ProfileCard
              name={target.name}
              createdAt={target.createdAt * 1000}
            />
          </View>
        </View>

        <View style={styles.contentCard}>
          <Group style={styles.infoGroup}>
            {[
              { label: t("settings.hub.role"), value: roleLabel(target.role) },
              { label: t("settings.hub.devices"), value: String(count) },
            ].map((row) => (
              <ActionButton
                key={row.label}
                label={row.label}
                rightElement={
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {row.value}
                  </Text>
                }
              />
            ))}
          </Group>
        </View>

        {/* devices section */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.hub.devices")}
            </Text>
            {targetDeviceTiles.length > 0 ? (
              <CardGrid
                cards={targetDeviceTiles}
                minCardWidth={TILE_MIN_WIDTH}
              />
            ) : (
              <Text style={styles.helpText}>{t("hubProfile.noDevices")}</Text>
            )}
          </View>
        </View>

        {/* actions section */}
        <View style={styles.contentCard}>
          <Group>
            <ActionButton
              icon={profilIcon}
              label={
                nextRole === "admin"
                  ? t("sampler.profile.makeAdmin")
                  : t("sampler.profile.makeMember")
              }
              onPress={() =>
                runAdmin(() =>
                  SamplerHub.setProfileRole(pairedHub, target.id, nextRole),
                )
              }
            />
            <ActionButton
              icon={binIcon}
              label={t("sampler.profile.remove")}
              onPress={() => confirmRemoveProfile(target)}
            />
          </Group>
        </View>
      </>
    );
  };

  //servers of each profile
  const renderMcpServers = () => {
    const owners = profiles ?? [];
    return (
      <View style={styles.contentCard}>
        {!!overviewError && (
          <View style={styles.settingRowVertical}>
            <Text style={styles.helpText}>
              {t("hubMcp.failed", { error: overviewError })}
            </Text>
          </View>
        )}
        {owners.map((owner, index) => {
          const servers = (overview ?? []).filter(
            (s) => ownerOf(s) === owner.id,
          );
          return (
            <View
              key={owner.id}
              style={[
                styles.settingRowVertical,
                index === owners.length - 1 && { marginBottom: 0 },
              ]}
            >
              <View
                style={[styles.toggleGroupRow, { marginBottom: Spacing.md }]}
              >
                <View style={styles.toggleGroupContent}>
                  <Text style={styles.settingLabel}>
                    {owner.id === profile?.id
                      ? t("sampler.mcpMine")
                      : owner.name}
                  </Text>
                </View>
                <Toggle
                  checked={servers.some((s) => s.enabled)}
                  onToggle={(on) => switchServers(servers, on)}
                  disabled={servers.length === 0}
                />
              </View>
              {servers.length > 0 ? (
                <CardGrid
                  minCardWidth={TILE_MIN_WIDTH}
                  cards={servers.map((server) => ({
                    key: server.id,
                    title: server.title,
                    error: server.state === "failed",
                    status: serverStatus(server),
                    onPress: () => setSelectedMcpServerId(server.id),
                  }))}
                />
              ) : (
                <Text style={styles.helpText}>
                  {overview ? t("sampler.mcpNone") : t("hubMcp.loading")}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  //older hubs lack these settings, both stay on
  const modelsOn = settings?.models !== false;
  const mcpOn = settings?.mcpServers !== false;

  //live graph of the hub processor and memory
  const renderPerformance = () => {
    if (status?.memory == null) return null;
    const cpuText = (value: number) =>
      t("hubMcp.cpuValue", { value: Math.round(value) });
    //the hub total holds llama.cpp and the servers, so the hub alone is what is left
    const running = overview?.filter((server) => server.state === "running");
    const parts =
      modelsStatus && running
        ? {
            llamaCpu: modelsStatus.cpu ?? 0,
            llamaMemory: modelsStatus.memory ?? 0,
            mcpCpu: running.reduce((sum, server) => sum + (server.cpu ?? 0), 0),
            mcpMemory: running.reduce(
              (sum, server) => sum + (server.memory ?? 0),
              0,
            ),
          }
        : null;
    const average = (samples: number[]) =>
      samples.reduce((sum, sample) => sum + sample, 0) /
      Math.max(1, samples.length);
    const peak = (samples: number[]) => Math.max(0, ...samples);
    const { cpu, memory } = usageHistory;
    const cpuNow = status.cpu ?? 0;
    const rows = [
      {
        label: t("sampler.usageNow"),
        values: [cpuText(cpuNow), formatBytes(status.memory)],
      },
      {
        label: t("sampler.usageAverage"),
        values: [cpuText(average(cpu)), formatBytes(average(memory))],
      },
      {
        label: t("sampler.usagePeak"),
        values: [cpuText(peak(cpu)), formatBytes(peak(memory))],
      },
      ...(parts
        ? [
            {
              label: `- ${t("sampler.usageHub")}`,
              values: [
                cpuText(Math.max(0, cpuNow - parts.llamaCpu - parts.mcpCpu)),
                formatBytes(
                  Math.max(
                    0,
                    status.memory - parts.llamaMemory - parts.mcpMemory,
                  ),
                ),
              ],
            },
            {
              label: `- ${t("sampler.usageLlama")}`,
              values: [cpuText(parts.llamaCpu), formatBytes(parts.llamaMemory)],
            },
            {
              label: `- ${t("sampler.usageMcp")}`,
              values: [cpuText(parts.mcpCpu), formatBytes(parts.mcpMemory)],
            },
          ]
        : []),
    ];
    //memory scales on its own peak
    return (
      <MetricChart
        title={t("sampler.usageChart")}
        series={[
          {
            label: t("sampler.usageCpu"),
            samples: cpu,
            color: Colors.primary,
            max: 100,
          },
          {
            label: t("sampler.usageMemory"),
            samples: memory,
            color: Colors.textPrimary,
          },
        ]}
        received={usageHistory.received}
        table={{
          columns: [t("sampler.usageCpu"), t("sampler.usageMemory")],
          rows,
        }}
      />
    );
  };

  //feature switch above its content
  const renderFeatureToggle = (
    label: string,
    help: string,
    on: boolean,
    key: "models" | "mcpServers",
  ) =>
    settings && (
      <View style={[styles.contentCard, on && styles.contentCardLit]}>
        {renderToggleRow(
          label,
          help,
          on,
          (value) => changeSettings({ [key]: value }),
          true,
          on,
        )}
      </View>
    );

  const hostHero = (
    <>
      <Image
        source={HUB_DEVICE_ICONS.desktop}
        style={styles.hostIcon}
        tintColor={Colors.textPrimary}
      />
      <Text style={styles.hostName} numberOfLines={1}>
        {status?.name ?? pairedHub?.name ?? ""}
      </Text>
    </>
  );

  //hub info, then its actions
  const hubRows = () => {
    const connection = {
      checking: t("settings.hub.checking"),
      offline: t("settings.hub.offline"),
      revoked: t("settings.hub.offline"),
      outdated: t("settings.hub.outdated"),
      online: status?.direct
        ? t("settings.hub.direct")
        : t("settings.hub.relay"),
    }[hubState];
    const rows = [
      { label: t("settings.hub.connection"), value: connection },
      ...(status
        ? [{ label: t("settings.hub.version"), value: status.version }]
        : []),
      ...(status?.update
        ? [
            {
              label: t("settings.hub.update"),
              value: t("settings.hub.updateAvailable", {
                version: status.update,
              }),
            },
          ]
        : []),
    ];
    return rows;
  };

  const renderHubCard = () => {
    const rows = hubRows();
    return (
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          {hostHero}
          <Group style={[styles.infoGroup, styles.groupSpacingTight]}>
            {rows.map((row) => (
              <ActionButton
                key={row.label}
                label={row.label}
                rightElement={
                  <Text
                    style={styles.infoValue}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {row.value}
                  </Text>
                }
              />
            ))}
          </Group>
          <Group>
            {status?.update && isAdmin && SamplerHub.canUpdateHub() && (
              <ActionButton
                icon={downloadIcon}
                label={t("settings.hub.installUpdate")}
                onPress={() => installUpdate(status.update!)}
              />
            )}
            {hostsHub && !hubStopped && (
              <ActionButton
                icon={cancelIcon}
                label={t("settings.hub.stopHosting")}
                disabled={hostBusy}
                onPress={confirmStop}
              />
            )}
            {!hostedHere && (
              <ActionButton
                icon={cancelIcon}
                label={t("settings.hub.unpair")}
                onPress={unpair}
              />
            )}
          </Group>
        </View>
      </View>
    );
  };

  //the hub with its devices turning around it
  const renderHubOrbit = () => {
    const nodes: OrbitNode[] = (devices ?? []).map((device) => ({
      key: device.id,
      name: device.name,
      icon: HUB_DEVICE_ICONS[device.kind] ?? operaIcon,
      connected:
        device.id === thisDeviceId ||
        (!!device.lastSeen &&
          devicesAt - device.lastSeen <= HUB_CONNECTED_WITHIN_S),
      onPress:
        isAdmin || device.id === thisDeviceId
          ? () => setSelectedDeviceId(device.id)
          : undefined,
    }));
    return (
      <View style={styles.contentCard}>
        <HubOrbit
          hubIcon={HUB_DEVICE_ICONS.desktop}
          nodes={nodes}
          onHubPress={() => setHubSheetVisible(true)}
          active={visible && page === "home"}
        />
      </View>
    );
  };

  const renderHome = () => (
    <>
      {renderHubOrbit()}
      {renderProfilesCard(false)}
    </>
  );

  const renderProfiles = () => (
    <>
      {renderProfilesCard(true)}
      {renderDevicesCard(true)}
    </>
  );

  //llama.cpp options for every device, a change restarts it
  const renderModelOptions = () => {
    if (!settings) return null;
    const rows = [
      {
        key: "ctxSize" as const,
        icon: messageIcon,
        label: t("sampler.model.ctx"),
        help: t("sampler.model.ctxHelp"),
        options: CTX_SIZE_OPTIONS,
      },
      {
        key: "keepAlive" as const,
        icon: timeIcon,
        label: t("sampler.model.keepAlive"),
        help: t("sampler.model.keepAliveHelp"),
        options: KEEP_ALIVE_OPTIONS,
      },
      {
        key: "parallel" as const,
        icon: tilesIcon,
        label: t("sampler.model.parallel"),
        help: t("sampler.model.parallelHelp"),
        options: PARALLEL_OPTIONS,
      },
    ];
    return (
      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <Text style={styles.settingLabel}>{t("sampler.model.title")}</Text>
          <Text style={styles.helpText}>{t("sampler.model.help")}</Text>
        </View>
        {rows.map((row, index) => (
          <View
            key={row.key}
            style={[
              styles.settingRowVertical,
              isDesktop && styles.toggleGroupRow,
              index === rows.length - 1 && { marginBottom: 0 },
            ]}
          >
            {/* desktop puts the slider at the right of the text */}
            <View style={isDesktop && styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>{row.label}</Text>
              <Text
                style={[
                  styles.helpText,
                  !isDesktop && { marginBottom: Spacing.md },
                ]}
              >
                {row.help}
              </Text>
            </View>
            <Group style={isDesktop && styles.sliderGroup}>
              <Slider
                icon={row.icon}
                options={row.options}
                //older hubs lack these, llama.cpp keeps its defaults
                selectedValue={String(settings[row.key] ?? 0)}
                onSelect={(value) =>
                  changeSettings({ [row.key]: Number(value) })
                }
              />
            </Group>
          </View>
        ))}
      </View>
    );
  };

  //the back button floats above, the spacers keep the title centered
  const renderPageHeader = (title: string) => (
    <View style={styles.header}>
      <View style={styles.headerSpacer} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  //share, nightly build and llama.cpp options
  const renderModelSettings = () => (
    <>
        {modelsOn && settings && (
          <View style={styles.contentCard}>
            {renderToggleRow(
              t("settings.hub.shareProviders"),
              t("settings.hub.shareProvidersHelp"),
              settings.shareProviders,
              (value) => changeSettings({ shareProviders: value }),
              false,
            )}
            {renderToggleRow(
              t("sampler.model.nightly"),
              t("sampler.model.nightlyHelp"),
              settings.modelsNightly,
              (value) => changeSettings({ modelsNightly: value }),
              !modelsStatus?.build,
            )}
            {modelsStatus?.build && (
              <Group style={styles.infoGroup}>
                <ActionButton
                  label={t("sampler.model.build")}
                  rightElement={
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {modelsStatus.build}
                    </Text>
                  }
                />
              </Group>
            )}
          </View>
        )}
        {modelsOn && renderModelOptions()}
    </>
  );

  const renderModels = () => {
    return (
      <>
        {renderFeatureToggle(
          t("sampler.feature.models"),
          t("sampler.feature.modelsHelp"),
          modelsOn,
          "models",
        )}
        {modelsOn && modelsSection()}
      </>
    );
  };

  const renderMcp = () => (
    <>
      {renderFeatureToggle(
        t("sampler.feature.mcp"),
        t("sampler.feature.mcpHelp"),
        mcpOn,
        "mcpServers",
      )}
      {canManageMcp && mcpOn && myMcpSection()}
      {showMcpOverview && mcpOn && renderMcpServers()}
    </>
  );

  const renderPreferences = () => {
    return (
      <>
        {online && settings && (
          <View style={styles.contentCard}>
            {renderToggleRow(
              t("settings.hub.lanDiscovery"),
              t("settings.hub.lanDiscoveryHelp"),
              settings.lanDiscovery,
              (value) => changeSettings({ lanDiscovery: value }),
            )}
          </View>
        )}

        {/* where the sampler looks for mcp servers */}
        {online && isAdmin && registries && (
          <View style={styles.contentCard}>
            <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
              <Text style={styles.settingLabel}>{t("sampler.registries")}</Text>
              <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
                {registryError ?? t("sampler.registriesHelp")}
              </Text>
              {registries.length > 0 && (
                <Group style={styles.groupSpacingTight}>
                  {registries.map((url) => (
                    <ActionButton
                      key={url}
                      icon={binIcon}
                      label={url}
                      onPress={() => confirmRemoveRegistry(url)}
                    />
                  ))}
                </Group>
              )}
              <Group>
                <TextInputField
                  icon={serverIcon}
                  placeholder="https://registry.example.com"
                  value={registryDraft}
                  onChangeText={setRegistryDraft}
                  onSubmitEditing={() =>
                    registryDraft.trim() &&
                    saveRegistries([...registries, registryDraft.trim()])
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <ActionButton
                  icon={addIcon}
                  label={t("sampler.addRegistry")}
                  disabled={!registryDraft.trim()}
                  onPress={() =>
                    saveRegistries([...registries, registryDraft.trim()])
                  }
                />
              </Group>
            </View>
          </View>
        )}

        {renderHubCard()}
      </>
    );
  };

  const pageTitles: Record<SubPage, string> = {
    home: t("sampler.nav.home"),
    profiles: t("sampler.nav.profiles"),
    models: t("hubModels.pageTitle"),
    mcp: t("hubMcp.pageTitle"),
    performance: t("sampler.performance"),
    preferences: t("sampler.nav.preferences"),
    profile: profiles?.find((p) => p.id === profileId)?.name ?? "",
  };

  //one group per family, like the settings sidebar
  type NavItem = { page: Page; icon: ImageSourcePropType };
  const navGroups = (
    [
      [
        { page: "home", icon: homeIcon },
        { page: "profiles", icon: profilIcon },
        { page: "performance", icon: quickIcon },
      ],
      [
        ...(showModels ? [{ page: "models" as const, icon: botIcon }] : []),
        ...(showMcp ? [{ page: "mcp" as const, icon: toolIcon }] : []),
        { page: "preferences", icon: settingsIcon },
      ],
    ] as NavItem[][]
  ).filter((items) => items.length > 0);
  const navItems = navGroups.flat();
  //a page the role no longer opens falls back home
  const shownPage = navItems.some((item) => item.page === sectionOf(page))
    ? page
    : "home";
  const section = sectionOf(shownPage);

  //open sheets keep the back press for themselves
  const sheetOpen =
    pairingVisible ||
    profileSheet !== null ||
    qrMode !== null ||
    selectedDeviceId !== null ||
    modelsSheetVisible ||
    modelSettingsVisible ||
    mcpSheetVisible ||
    folderPick !== null ||
    detail !== null ||
    selectedMcpServerId !== null ||
    myMcpDetail !== null;

  const handleBack = useCallback(
    () => openPage(parentOf(shownPage) ?? "home"),
    [shownPage],
  );

  //android back pops nested subpages before leaving sampler
  useEffect(() => {
    if (!visible || isDesktop || drawerVisible || sheetOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (parentOf(shownPage)) {
        handleBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, isDesktop, drawerVisible, sheetOpen, shownPage, handleBack]);

  const [prevDrawerVisible, setPrevDrawerVisible] = useState(drawerVisible);
  if (drawerVisible !== prevDrawerVisible) {
    setPrevDrawerVisible(drawerVisible);
    if (drawerVisible) setDrawerScrolled(false);
  }

  useEffect(() => {
    if (isDesktop) return;
    if (drawerVisible) {
      Keyboard.dismiss();
      settleDrawer(samplerDrawerProgress, true);
    } else {
      settleDrawer(samplerDrawerProgress, false);
    }
  }, [drawerVisible, isDesktop]);

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dx < -10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_, gestureState) => {
          dragDrawer(samplerDrawerProgress, 1 + gestureState.dx / drawerWidth);
        },
        onPanResponderRelease: (_, gestureState) => {
          const open = releaseOpens(
            1 + gestureState.dx / drawerWidth,
            gestureState.vx,
          );
          settleDrawer(
            samplerDrawerProgress,
            open,
            gestureVelocity(gestureState.vx, drawerWidth),
          );
          if (!open) onCloseDrawer?.();
        },
        onPanResponderTerminate: () => {
          settleDrawer(samplerDrawerProgress, true);
        },
      }),
    [onCloseDrawer, drawerWidth],
  );

  const renderPageContent = (shown: SubPage) => {
    switch (shown) {
      case "profiles":
        return renderProfiles();
      case "profile":
        return renderProfile();
      case "models":
        return renderModels();
      case "mcp":
        return renderMcp();
      case "performance":
        return renderPerformance();
      case "preferences":
        return renderPreferences();
      default:
        return renderHome();
    }
  };

  const renderScrollPage = (shown: SubPage, active: boolean) => (
    //focused field scrolls just above the keyboard
    <KeyboardAwareScrollView
      bottomOffset={Spacing.xl2}
      contentContainerStyle={[
        styles.scroll,
        {
          paddingTop: contentTop,
          paddingBottom: 40 + (isDesktop ? 0 : insets.bottom),
        },
      ]}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={
        active
          ? (e) => setScrolled(e.nativeEvent.contentOffset.y > 10)
          : undefined
      }
    >
      <View
        style={styles.page}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          if (width > 0 && width !== pageWidth) setPageWidth(width);
        }}
      >
        {renderPageHeader(pageTitles[shown])}
        {renderPageContent(shown)}
      </View>
    </KeyboardAwareScrollView>
  );

  //not hosting yet, hub off, or no profile on this hub
  const renderWelcome = () => {
    //stored pairing never shows onboarding
    const paired = !!pairedHub;
    //a browser cannot host, it leaves the screen once unpaired
    if (!paired && isDesktop && !canHost) return null;
    if (paired && (!online || hubStopped)) {
      return renderStopped();
    }
    if (paired && !profile) {
      return (
        <View style={styles.welcome}>
          <Text style={styles.welcomeText}>
            {status?.name ?? pairedHub.name}
          </Text>
          <Text style={styles.welcomeHelp}>
            {t("settings.hub.noProfileHelp")}
          </Text>
          <View style={styles.welcomeAction}>
            <Group style={[styles.highlightGroup, styles.groupSpacingTight]}>
              <ActionButton
                icon={profilIcon}
                label={t("settings.hub.chooseProfile")}
                variant="highlight"
                onPress={() => setProfileSheet("pick")}
              />
            </Group>
            {!hostedHere && (
              <Group>
                <ActionButton
                  icon={cancelIcon}
                  label={t("settings.hub.unpair")}
                  onPress={unpair}
                />
              </Group>
            )}
          </View>
        </View>
      );
    }
    if (!canHost) {
      return (
        <View style={styles.welcome}>
          <Text style={styles.welcomeText}>{t("sampler.welcome")}</Text>
          <Text style={styles.welcomeHelp}>{t("settings.hub.help")}</Text>
          <View style={styles.welcomeAction}>
            <Pressable
              style={pressStyle(styles.welcomePill, "surface")}
              onPress={() => setPairingVisible(true)}
            >
              <Text style={styles.welcomePillText}>{t("sampler.linkHub")}</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.welcome}>
        <Text style={styles.welcomeText}>{t("sampler.welcome")}</Text>
        {!!hostError && <Text style={styles.welcomeHelp}>{hostError}</Text>}
        <View style={styles.welcomeAction}>
          <Pressable
            style={pressStyle(styles.welcomePill, "surface")}
            disabled={hostBusy}
            onPress={startHosting}
          >
            <Text style={styles.welcomePillText}>
              {t("sampler.startHosting")}
            </Text>
          </Pressable>
          <Pressable
            style={styles.welcomeLink}
            onPress={() => setPairingVisible(true)}
          >
            <Text style={styles.welcomeLinkText}>{t("sampler.linkHub")}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  //the nav and pages need the hub up and a profile
  //a stopped hub may still answer for a moment
  const ready = !!pairedHub && !!profile && online && !hubStopped;
  const { dockedWidth, resizeResponder } = useDockedWidth();

  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  //appears and slides in from left after the chat sidebar leaves
  const navTranslateX = useMemo(
    () =>
      transitionProgress
        ? transitionProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [-dockedWidth, -dockedWidth, 0],
          })
        : 0,
    [transitionProgress, dockedWidth],
  );
  const navOpacity = useMemo(
    () =>
      transitionProgress
        ? transitionProgress.interpolate({
            inputRange: [0, 0.55, 1],
            outputRange: [0, 0, 1],
          })
        : 1,
    [transitionProgress],
  );

  const drawerTranslateX = samplerDrawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  const dismissDrawer = () => {
    settleDrawer(samplerDrawerProgress, false);
    onCloseDrawer?.();
  };

  const mobileDrawer = (
    <View
      style={[
        styles.drawerRoot,
        { pointerEvents: drawerVisible ? "auto" : "none" },
      ]}
    >
      <Animated.View
        style={[styles.drawerOverlay, { opacity: samplerDrawerProgress }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissDrawer} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawerContent,
          { width: drawerWidth },
          { transform: [{ translateX: drawerTranslateX }] },
        ]}
        {...drawerPanResponder.panHandlers}
      >
        <View style={styles.drawerScrollContainer}>
          <View
            style={[styles.fixedCloseWrapper, { top: 60 }]}
            pointerEvents="box-none"
          >
            <DrawerBackButton
              kind="close"
              onPress={dismissDrawer}
              scrolled={drawerScrolled}
            />
          </View>

          <ScrollView
            onScroll={(e) =>
              setDrawerScrolled(e.nativeEvent.contentOffset.y > 10)
            }
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 60, paddingBottom: 40 }}
          >
            <View style={styles.header}>
              <View style={styles.headerSpacer} />
              <Text style={styles.title} numberOfLines={1}>
                {t("sampler.switch.sampler")}
              </Text>
              <View style={styles.headerSpacer} />
            </View>

            {onOpenChat && (
              <Group style={styles.navGroup}>
                <ActionButton
                  icon={messageIcon}
                  iconBadge
                  label={t("sampler.switch.chat")}
                  onPress={() => {
                    dismissDrawer();
                    onOpenChat();
                  }}
                />
              </Group>
            )}

            {ready &&
              navGroups.map((items, index) => (
                <Group key={index} style={styles.navGroup}>
                  {items.map((item) => (
                    <ActionButton
                      key={item.page}
                      icon={item.icon}
                      iconBadge
                      label={pageTitles[item.page]}
                      onPress={() => {
                        openPage(item.page);
                        dismissDrawer();
                      }}
                    />
                  ))}
                </Group>
              ))}
          </ScrollView>

          <LinearGradient
            colors={[
              Colors.groupedBackground,
              Colors.groupedBackgroundFade,
              Colors.groupedBackgroundClear,
            ]}
            style={styles.screenGradientTop}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[
              Colors.groupedBackgroundClear,
              Colors.groupedBackgroundFade,
              Colors.groupedBackground,
            ]}
            style={styles.screenGradientBottom}
            pointerEvents="none"
          />
        </View>
      </Animated.View>
    </View>
  );

  const selectedMcpServer =
    overview?.find((s) => s.id === selectedMcpServerId) ?? null;

  //share, nightly build and llama.cpp options
  const modelSettingsSheet = (
    <DrawerSheet
      visible={modelSettingsVisible}
      onClose={() => setModelSettingsVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* cancels the margin of the last card */}
        <View style={{ marginBottom: -Spacing.xxl2 }}>
          {renderModelSettings()}
        </View>
      </SheetScrollView>
    </DrawerSheet>
  );

  //installed model detail sheet
  const hubModelSheet = (
    <DrawerSheet
      visible={detail !== null}
      onClose={() => setDetail(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {detail && (
          <HubModelPage file={detail.file} onDeleted={() => setDetail(null)} />
        )}
      </SheetScrollView>
    </DrawerSheet>
  );

  //mcp server overview detail sheet
  const mcpServerSheet = (
    <DrawerSheet
      visible={selectedMcpServerId !== null && selectedMcpServer !== null}
      onClose={() => setSelectedMcpServerId(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderMcpServer()}
      </SheetScrollView>
    </DrawerSheet>
  );

  //personal mcp server detail sheet
  const myMcpServerSheet = (
    <DrawerSheet
      visible={myMcpDetail !== null}
      onClose={() => setMyMcpDetail(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetKeyboardAwareScrollView
        bottomOffset={Spacing.xl2}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {myMcpDetail && (
          <HubMcpServerPage
            id={myMcpDetail.id}
            onRemoved={() => setMyMcpDetail(null)}
            onPickFolder={(start, done) => setFolderPick({ start, done })}
          />
        )}
      </SheetKeyboardAwareScrollView>
    </DrawerSheet>
  );

  return (
    <>
      <View style={styles.root} pointerEvents={visible ? "box-none" : "none"}>
        {isDesktop && ready && (
          <Animated.View
            style={[
              styles.nav,
              {
                width: dockedWidth,
                opacity: navOpacity,
                transform: [{ translateX: navTranslateX }],
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.navScroll}
            >
              {navGroups.map((items, index) => (
                <Group key={index} style={styles.navGroup}>
                  {items.map((item) => (
                    <ActionButton
                      key={item.page}
                      icon={item.icon}
                      iconBadge
                      label={pageTitles[item.page]}
                      style={[
                        styles.navButton,
                        section === item.page && styles.navButtonSelected,
                      ]}
                      onPress={() => openPage(item.page)}
                    />
                  ))}
                </Group>
              ))}
            </ScrollView>
            <View
              //web accepts any css cursor
              style={[styles.resizeHandle, { cursor: "col-resize" } as any]}
              {...resizeResponder.panHandlers}
            />
          </Animated.View>
        )}

        <Animated.View
          style={[
            styles.main,
            mainTranslateX && { transform: [{ translateX: mainTranslateX }] },
          ]}
        >
          {loaded &&
            (ready ? (
              <View
                style={styles.stack}
                onLayout={(e) => setStackWidth(e.nativeEvent.layout.width)}
              >
                {parentOf(shownPage) && (
                  <View
                    style={[styles.backWrapper, { top: contentTop }]}
                    pointerEvents="box-none"
                  >
                    <View style={styles.backColumn} pointerEvents="box-none">
                      <DrawerBackButton
                        kind="back"
                        onPress={handleBack}
                        scrolled={scrolled}
                        pulseKey={shownPage}
                      />
                    </View>
                  </View>
                )}
                {shownPage === "models" && modelsOn && settings && (
                  <View
                    style={[styles.backWrapper, { top: contentTop }]}
                    pointerEvents="box-none"
                  >
                    <View
                      style={[styles.backColumn, { alignItems: "flex-end" }]}
                      pointerEvents="box-none"
                    >
                      <DrawerBackButton
                        kind="more"
                        onPress={() => setModelSettingsVisible(true)}
                        scrolled={scrolled}
                      />
                    </View>
                  </View>
                )}
                {((shownPage === "models" && modelsOn) ||
                  (shownPage === "mcp" && canManageMcp && mcpOn)) && (
                  <View
                    style={[
                      styles.addModelWrapper,
                      { bottom: Spacing.xl2 + (isDesktop ? 0 : insets.bottom) },
                    ]}
                    pointerEvents="box-none"
                  >
                    <FloatingButton
                      icon={addIcon}
                      onPress={() =>
                        shownPage === "mcp"
                          ? setMcpSheetVisible(true)
                          : setModelsSheetVisible(true)
                      }
                    />
                  </View>
                )}
                {/* switching section swaps pages, only nested pages push */}
                <PageStack
                  key={section}
                  page={shownPage}
                  visible
                  width={stackWidth || 1000}
                  parentOf={parentOf}
                  gestureEnabled={!sheetOpen}
                  onBack={handleBack}
                  renderPage={renderScrollPage}
                />
              </View>
            ) : (
              renderWelcome()
            ))}
        </Animated.View>
      </View>

      {!isDesktop && mobileDrawer}

      <HubPairingSheet
        visible={pairingVisible}
        onClose={() => setPairingVisible(false)}
        onPaired={() => {
          setPairingVisible(false);
          refresh();
          setProfileSheet("pick");
        }}
        pairedHub={pairedHub}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <HubProfileSheet
        visible={profileSheet !== null}
        hub={pairedHub}
        profile={selectedProfile ?? profile}
        devices={devices}
        thisDeviceId={thisDeviceId}
        isSelf={!selectedProfile || selectedProfile.id === profile?.id}
        canManage={isAdmin}
        changePassword={profileSheet === "password"}
        defaultName={Settings.getCached().name}
        onClose={() => {
          setProfileSheet(null);
          setSelectedProfile(null);
        }}
        onDone={handleProfileDone}
        onSelectDevice={(device) => {
          setProfileSheet(null);
          setSelectedDeviceId(device.id);
        }}
        onToggleRole={(target) => {
          const nextRole = target.role === "admin" ? "member" : "admin";
          runAdmin(async () => {
            await SamplerHub.setProfileRole(pairedHub!, target.id, nextRole);
            refresh();
          });
        }}
        onRemoveProfile={(target) => {
          setProfileSheet(null);
          confirmRemoveProfile(target);
        }}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <HubQrSheet
        visible={qrMode !== null}
        onClose={() => {
          setQrMode(null);
          //an approved device shows up in the list
          refresh();
        }}
        hub={pairedHub}
        mode={qrMode ?? "link"}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <HubSheet
        visible={hubSheetVisible}
        rows={[
          {
            label: t("settings.hub.name"),
            value: status?.name ?? pairedHub?.name ?? "",
          },
          ...hubRows(),
        ]}
        canStop={hostsHub && !hubStopped}
        busy={hostBusy}
        onStop={() => {
          setHubSheetVisible(false);
          confirmStop();
        }}
        onClose={() => setHubSheetVisible(false)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <HubDeviceSheet
        device={devices?.find((d) => d.id === selectedDeviceId) ?? null}
        hub={pairedHub}
        isSelf={selectedDeviceId === thisDeviceId}
        canManage={isAdmin}
        onClose={() => setSelectedDeviceId(null)}
        onChanged={refresh}
        onUnpairSelf={
          hostedHere
            ? undefined
            : () => {
                setSelectedDeviceId(null);
                unpair();
              }
        }
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <HubModelsSheet
        visible={modelsSheetVisible}
        onClose={() => setModelsSheetVisible(false)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      {hubModelSheet}
      {modelSettingsSheet}
      <HubMcpSheet
        visible={mcpSheetVisible}
        onClose={() => setMcpSheetVisible(false)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      {mcpServerSheet}
      {myMcpServerSheet}
      <HubFolderSheet
        visible={folderPick !== null}
        start={folderPick?.start}
        onPick={(path) => {
          folderPick?.done(path);
          setFolderPick(null);
        }}
        onClose={() => setFolderPick(null)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <NotificationModal
        visible={modal !== null}
        title={modal?.title}
        message={modal?.message}
        buttons={modal?.buttons}
        loading={modal?.loading}
        onClose={closeModal}
      />
    </>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      flexDirection: "row",
    },
    drawerRoot: {
      ...StyleSheet.absoluteFill,
      zIndex: 1000,
      elevation: 1000,
    },
    drawerOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: Colors.scrimDrawer,
    },
    drawerContent: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      backgroundColor: Colors.groupedBackground,
      paddingHorizontal: Spacing.lg2,
      overflow: "hidden",
    },
    drawerScrollContainer: {
      flex: 1,
      position: "relative",
    },
    fixedCloseWrapper: {
      position: "absolute",
      right: 0,
      zIndex: 100,
    },
    screenGradientTop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 50,
    },
    screenGradientBottom: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 40,
    },
    //same column as the settings sidebar
    nav: {
      backgroundColor: Colors.surface,
      borderRightWidth: 2,
      borderRightColor: Colors.border,
      paddingTop: isTauri ? 32 : 0,
      paddingHorizontal: Spacing.lg2,
      zIndex: 10,
    },
    //sits over the border
    resizeHandle: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      width: 8,
    },
    navScroll: {
      paddingTop: Spacing.lg,
      paddingBottom: 40,
    },
    navGroup: {
      marginBottom: Spacing.xxl,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
    },
    navButton: {
      borderRadius: Radius.pill,
    },
    navButtonSelected: {
      backgroundColor: Colors.surfacePressed,
    },
    main: {
      flex: 1,
    },
    //clips the pages sliding in and out
    stack: {
      flex: 1,
      overflow: "hidden",
    },
    backWrapper: {
      position: "absolute",
      top: CONTENT_TOP,
      left: 0,
      right: 0,
      zIndex: 100,
      elevation: 10,
      paddingHorizontal: Spacing.xl2,
    },
    addModelWrapper: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "flex-end",
      zIndex: 100,
      elevation: 10,
      paddingHorizontal: Spacing.xl2,
    },
    backColumn: {
      width: "100%",
      maxWidth: PAGE_MAX_WIDTH,
      alignSelf: "center",
    },
    scroll: {
      paddingTop: CONTENT_TOP,
      paddingBottom: 40,
      paddingHorizontal: Spacing.xl2,
    },
    page: {
      width: "100%",
      maxWidth: PAGE_MAX_WIDTH,
      alignSelf: "center",
    },
    welcome: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: Spacing.xxl2,
    },
    //same as the chat home greeting
    welcomeText: {
      fontSize: FontSizes.displayLg,
      color: Colors.textPrimary,
      letterSpacing: 1,
      fontFamily: Fonts.display,
      marginVertical: 20,
      textAlign: "center",
    },
    welcomeHelp: {
      fontSize: FontSizes.bodyMd,
      color: Colors.textMuted,
      fontFamily: Fonts.body,
      lineHeight: 20,
      textAlign: "center",
      maxWidth: 420,
    },
    welcomeAction: {
      width: 260,
      marginTop: Spacing.xxl2,
    },
    welcomeLink: {
      alignSelf: "center",
      marginTop: Spacing.xl2,
    },
    welcomeLinkText: {
      fontSize: FontSizes.bodyMd,
      color: Colors.textPrimary,
      fontFamily: Fonts.body,
    },
    welcomePill: {
      alignSelf: "center",
      borderRadius: Radius.xxl,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl2,
      backgroundColor: Colors.surface,
    },
    welcomePillText: {
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      fontFamily: Fonts.mono,
      textAlign: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.xxxl,
      minHeight: 40,
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    title: {
      flex: 1,
      fontSize: FontSizes.xxxl,
      color: Colors.textPrimary,
      fontFamily: Fonts.display,
      textAlign: "center",
      includeFontPadding: false,
      lineHeight: 40,
    },
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
      marginBottom: Spacing.xxl2,
    },
    contentCardLit: {
      backgroundColor: Colors.primary,
    },
    litText: {
      color: Colors.textOnPrimary,
    },
    settingRowVertical: {
      marginBottom: Spacing.xxl,
      zIndex: 10,
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
    toggleGroupRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    toggleGroupContent: {
      flex: 1,
      marginRight: Spacing.lg2,
    },
    sliderGroup: {
      width: SLIDER_WIDTH,
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
    infoGroup: {
      borderWidth: 0,
    },
    infoValue: {
      flexShrink: 1,
      maxWidth: "60%",
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    profileTiles: {
      gap: Spacing.md,
    },
    profileRow: {
      flexDirection: "row",
      gap: Spacing.md,
    },
    profileTile: {
      flex: 1,
      borderRadius: Radius.xl,
    },
    profileTilePlaceholder: {
      flex: 1,
    },
    hostIcon: {
      width: 120,
      height: 120,
      alignSelf: "center",
      marginVertical: Spacing.xl2,
    },
    hostName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.lg,
      color: Colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.md,
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
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      paddingVertical: Spacing.md,
    },
    desktopCard: {
      width: 560,
    },
    sheetContent: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
    },
  });
