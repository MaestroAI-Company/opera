import { ReactNode, useCallback, useEffect, useState } from "react";
import { Image, ImageSourcePropType, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import { HUB_PROVIDER_ID, getEnabledProviders, serializeProviders } from "../../services/ai/providers/sources";
import { HubSync } from "../../services/hub/HubSync";
import {
  HostStatus,
  HubDevice,
  HubProfile,
  HubSettings,
  HubStatus,
  McpServerSummary,
  OperaHub,
  PairedHub,
  hubErrorCode,
} from "../../services/hub/OperaHubService";
import { Settings } from "../../services/settings/SettingsService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import NotificationModal, { type ModalButton } from "../ui/NotificationModal";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import { pressStyle } from "../ui/pressStyle";
import DrawerBackButton from "./DrawerBackButton";
import HubDeviceSheet from "./HubDeviceSheet";
import HubMcpSection, { HubMcpServerPage } from "./HubMcpSection";
import HubMcpSheet, { HubFolderSheet } from "./HubMcpSheet";
import HubModelsSection, { HubModelPage } from "./HubModelsSection";
import HubModelsSheet from "./HubModelsSheet";
import HubProfileSheet from "./HubProfileSheet";
import HubQrSheet from "./HubQrSheet";
import ProfileCard from "./ProfileCard";

const samplerIcon = require("../../../assets/icons/operaicon5.png");
const profilIcon = require("../../../assets/icons/profil.png");
const brainIcon = require("../../../assets/icons/brain.png");
const toolIcon = require("../../../assets/icons/tool.png");
const settingsIcon = require("../../../assets/icons/settings.png");
const addIcon = require("../../../assets/icons/add.png");
const hyperlinkIcon = require("../../../assets/icons/hyperlink2.png");
const reconnectIcon = require("../../../assets/icons/reconnect.png");
const downloadIcon = require("../../../assets/icons/download.png");
const cancelIcon = require("../../../assets/icons/cancel.png");
const binIcon = require("../../../assets/icons/bin.png");
const serverIcon = require("../../../assets/icons/server.png");
const operaIcon = require("../../../assets/icons/operaicon.png");

const HUB_DEVICE_ICONS: Record<string, ImageSourcePropType> = {
  phone: require("../../../assets/icons/phone.png"),
  desktop: require("../../../assets/icons/laptop.png"),
  web: require("../../../assets/icons/website.png"),
};
const HUB_INACTIVE_AFTER_S = 30 * 24 * 60 * 60;
const USAGE_POLL_MS = 5000;
const OVERVIEW_POLL_MS = 10000;
const PAGE_MAX_WIDTH = 1000;
const NAV_WIDTH = 320;
//two home columns from this page width
const TWO_COLUMNS_FROM = 760;
const TILE_MIN_WIDTH = 150;
const PROFILE_TILE_WIDTH = 180;
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
//title bar, then the top bar and its padding
const CONTENT_TOP = (isTauri ? 32 : 0) + 60 + Spacing.xl2;

type Page = "home" | "profiles" | "models" | "mcp" | "preferences";
type Detail = { kind: "model"; file: string; name: string } | { kind: "mcp"; id: string; title: string };
type HubState = "checking" | "online" | "offline" | "revoked" | "outdated";
type Tile = { key: string; title: string; status: string; icon?: ImageSourcePropType; error?: boolean; onPress?: () => void };
type Modal = { title: string; message?: string; buttons: ModalButton[]; loading?: boolean };

type SamplerScreenProps = {
  //the chat and sampler switch
  topBar: ReactNode;
  isLargeScreen: boolean;
  isDesktop: boolean;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

//admin page of the sampler, desktop only
export default function SamplerScreen({ topBar, isLargeScreen, isDesktop }: SamplerScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();

  const [page, setPage] = useState<Page>("home");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pairedHub, setPairedHub] = useState<PairedHub | null>(null);
  const [hubState, setHubState] = useState<HubState>("checking");
  const [status, setStatus] = useState<HubStatus | null>(null);
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
  const [registries, setRegistries] = useState<string[] | null>(null);
  const [registryDraft, setRegistryDraft] = useState("");
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  //one tile row per page
  const [tileRowWidth, setTileRowWidth] = useState(0);
  const [profileSheet, setProfileSheet] = useState<"pick" | "password" | null>(null);
  const [qrMode, setQrMode] = useState<"invite" | "link" | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [modelsSheetVisible, setModelsSheetVisible] = useState(false);
  const [mcpSheetVisible, setMcpSheetVisible] = useState(false);
  const [folderPick, setFolderPick] = useState<{ start?: string; done: (path: string) => void } | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);

  const refresh = useCallback(async () => {
    const hub = await OperaHub.getPairedHub();
    setPairedHub(hub);
    setProfile(await OperaHub.getProfile());
    setHostStatus(await OperaHub.hostStatus().catch(() => null));
    setLoaded(true);
    if (!hub) return;
    OperaHub.deviceId()
      .then(setThisDeviceId)
      .catch(() => setThisDeviceId(null));
    try {
      setStatus(await OperaHub.status(hub));
      setHubState("online");
      const [nextDevices, nextProfiles, nextSettings] = await Promise.all([
        OperaHub.devices(hub).catch(() => null),
        OperaHub.profiles(hub).catch(() => null),
        OperaHub.hubSettings(hub).catch(() => null),
      ]);
      setDevices(nextDevices);
      setDevicesAt(Date.now() / 1000);
      setProfiles(nextProfiles);
      setSettings(nextSettings);
    } catch (e) {
      const code = hubErrorCode(e);
      setHubState(code === "Unauthorized" ? "revoked" : code === "Outdated" ? "outdated" : "offline");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the paired hub
    refresh();
  }, [refresh]);

  //usage stays live while the screen shows
  useEffect(() => {
    if (!pairedHub || hubState !== "online") return;
    const timer = setInterval(() => {
      OperaHub.status(pairedHub)
        .then(setStatus)
        .catch(() => {});
    }, USAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [pairedHub, hubState]);

  //the role may have changed since the profile was unlocked
  const role = profiles?.find((p) => p.id === profile?.id)?.role ?? profile?.role;
  const isAdmin = role === "admin" && Platform.OS !== "web";
  const online = hubState === "online";
  //nothing until the hub first answers
  const firstCheck = hubState === "checking" && !status;
  const hostsHub = !!hostStatus?.id && pairedHub?.id === hostStatus.id;
  const showModels = isAdmin && OperaHub.canManageModels();
  const showMcp = OperaHub.canManageMcp();

  //every profile's servers, read only
  useEffect(() => {
    if (page !== "mcp" || !isAdmin || !online) return;
    let live = true;
    const load = () =>
      OperaHub.mcp()
        .then((api) => api.overview())
        .then((servers) => live && setOverview(servers))
        .catch(() => live && setOverview(null));
    load();
    const timer = setInterval(load, OVERVIEW_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [page, isAdmin, online]);

  useEffect(() => {
    if (page !== "preferences" || !isAdmin || !online) return;
    OperaHub.mcp()
      .then((api) => api.registries())
      .then(setRegistries)
      .catch(() => setRegistries(null));
  }, [page, isAdmin, online]);

  const closeModal = () => setModal(null);

  const showError = (e: unknown) =>
    setModal({
      title: t("sampler.failed"),
      message: message(e),
      buttons: [{ text: t("common.ok"), style: "secondary", onPress: closeModal }],
    });

  //first time only, later the toggle turns it on and off
  const startHosting = async () => {
    setHostBusy(true);
    setHostError(null);
    try {
      //a hub left running only needs pairing
      if (!hostStatus?.running) await OperaHub.setHosting(true);
    } catch (e) {
      console.warn("[Sampler] hosting failed:", e);
      setHostError(t("settings.hub.hostFailed"));
      setHostBusy(false);
      return;
    }
    try {
      await OperaHub.pairWithThisComputer();
      setProfileSheet("pick");
    } catch (e) {
      setHostError(t(`hubPairing.error.${hubErrorCode(e)}`));
    } finally {
      setHostBusy(false);
      refresh();
    }
  };

  const setHosting = async (on: boolean) => {
    setHostBusy(true);
    setHostError(null);
    try {
      await OperaHub.setHosting(on);
    } catch (e) {
      console.warn("[Sampler] hosting failed:", e);
      setHostError(t("settings.hub.hostFailed"));
    } finally {
      setHostBusy(false);
      refresh();
    }
  };

  //same as joining from the settings
  const handleProfileDone = (next: HubProfile) => {
    setProfileSheet(null);
    setProfile(next);
    refresh();
    const enabled = getEnabledProviders();
    if (!enabled.includes(HUB_PROVIDER_ID)) {
      Settings.set("enabledProviders", serializeProviders([...enabled, HUB_PROVIDER_ID]));
    }
    HubSync.joinedProfile().catch((e) => console.warn("[HubSync] first sync failed:", e));
  };

  const changeSettings = async (patch: Partial<HubSettings>) => {
    if (!pairedHub || !settings) return;
    const wanted = { ...settings, ...patch };
    setSettings(wanted);
    try {
      setSettings(await OperaHub.setHubSettings(pairedHub, wanted));
    } catch (e) {
      console.warn("[Sampler] hub settings not saved:", e);
      setSettings(settings);
    }
  };

  const installUpdate = async (version: string) => {
    if (!pairedHub) return;
    try {
      await OperaHub.updateHub(pairedHub, version);
    } catch (e) {
      setModal({
        title: t("hubUpdate.title"),
        message: t("hubUpdate.failed", { error: message(e) }),
        buttons: [{ text: t("common.ok"), style: "secondary", onPress: closeModal }],
      });
    }
  };

  const unpair = () => {
    if (!pairedHub) return;
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
            await OperaHub.unpair(pairedHub);
            await HubSync.forgetHub();
            closeModal();
            setPage("home");
            setDetail(null);
            setProfile(null);
            setStatus(null);
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
    value === "admin" ? t("settings.hub.roleAdmin") : t("settings.hub.roleMember");

  const confirmRemoveProfile = (target: HubProfile) =>
    setModal({
      title: t("sampler.profile.removeTitle", { name: target.name }),
      message: t("sampler.profile.removeMessage"),
      buttons: [
        { text: t("common.cancel"), style: "secondary", onPress: closeModal },
        {
          text: t("sampler.profile.remove"),
          style: "danger",
          onPress: () => runAdmin(() => OperaHub.removeProfile(pairedHub!, target.id)),
        },
      ],
    });

  const openProfile = (target: HubProfile) => {
    if (target.id === profile?.id) {
      setProfileSheet("password");
      return;
    }
    if (!isAdmin || !pairedHub || !OperaHub.canManageProfiles()) return;
    const count = devices?.filter((d) => d.profile === target.id).length ?? 0;
    const nextRole = target.role === "admin" ? "member" : "admin";
    setModal({
      title: target.name,
      message: `${roleLabel(target.role)} · ${t("sampler.profile.devices", { count })}`,
      buttons: [
        { text: t("common.cancel"), style: "secondary", onPress: closeModal },
        {
          text: nextRole === "admin" ? t("sampler.profile.makeAdmin") : t("sampler.profile.makeMember"),
          style: "secondary",
          onPress: () => runAdmin(() => OperaHub.setProfileRole(pairedHub, target.id, nextRole)),
        },
        { text: t("sampler.profile.remove"), style: "danger", onPress: () => confirmRemoveProfile(target) },
      ],
    });
  };

  const saveRegistries = async (urls: string[]) => {
    setRegistryError(null);
    try {
      const api = await OperaHub.mcp();
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

  const ownerName = (id?: string | null) =>
    //servers from before profiles belong to admins
    id ? (profiles?.find((p) => p.id === id)?.name ?? t("sampler.noProfile")) : t("settings.hub.roleAdmin");

  const openPage = (next: Page) => {
    setPage(next);
    setDetail(null);
  };

  //tiles share the row, never narrower than the minimum
  const renderTiles = (tiles: Tile[]) => (
    <View
      style={styles.tiles}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        if (width > 0 && width !== tileRowWidth) setTileRowWidth(width);
      }}
    >
      {tiles.map((tile) => {
        const columns = Math.max(2, Math.floor((tileRowWidth + Spacing.md) / (TILE_MIN_WIDTH + Spacing.md)));
        const width = tileRowWidth > 0 ? Math.floor((tileRowWidth - Spacing.md * (columns - 1)) / columns) - 1 : "47%";
        const body = (
          <>
            {tile.icon && <Image source={tile.icon} style={styles.tileIcon} tintColor={Colors.textPrimary} />}
            <Text style={styles.tileTitle} numberOfLines={2}>
              {tile.title}
            </Text>
            <Text style={[styles.tileStatus, tile.error && { color: Colors.error }]} numberOfLines={1}>
              {tile.status}
            </Text>
          </>
        );
        return tile.onPress ? (
          <Pressable
            key={tile.key}
            style={pressStyle([styles.tile, { width }], "surface")}
            onPress={() => {
              Vibration.vibrate(8);
              tile.onPress!();
            }}
          >
            {body}
          </Pressable>
        ) : (
          <View key={tile.key} style={[styles.tile, { width }]}>
            {body}
          </View>
        );
      })}
    </View>
  );

  const renderToggleRow = (
    label: string,
    help: string,
    checked: boolean,
    onToggle: (value: boolean) => void,
    disabled = false,
  ) => (
    <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
      <View style={styles.toggleGroupRow}>
        <View style={styles.toggleGroupContent}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.helpText}>{help}</Text>
        </View>
        <Toggle checked={checked} onToggle={onToggle} disabled={disabled} />
      </View>
    </View>
  );

  const hostingCard = hostsHub && (
    <View style={styles.contentCard}>
      {renderToggleRow(
        t("sampler.hosting"),
        hostError ?? t("sampler.hostingHelp"),
        !!hostStatus?.running,
        setHosting,
        hostBusy,
      )}
    </View>
  );

  //hub off or out of reach
  const renderUnreachable = () => {
    if (hostsHub && !hostStatus?.running) return hostingCard;
    const connection = {
      checking: t("settings.hub.checking"),
      offline: t("settings.hub.offline"),
      revoked: t("settings.hub.revoked"),
      outdated: t("settings.hub.outdated"),
      online: "",
    }[hubState];
    return (
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{pairedHub?.name}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{connection}</Text>
          <Group>
            <ActionButton
              icon={reconnectIcon}
              label={t("settings.hub.check")}
              disabled={hubState === "checking"}
              onPress={() => {
                setHubState("checking");
                refresh();
              }}
            />
            <ActionButton icon={cancelIcon} label={t("settings.hub.unpair")} onPress={unpair} />
          </Group>
        </View>
      </View>
    );
  };

  //members only see their own card
  const profileCards = isAdmin ? (profiles ?? []) : (profiles ?? []).filter((p) => p.id === profile?.id);

  const profilesCard = (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={styles.settingLabel}>{t("sampler.profiles")}</Text>
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
          {isAdmin ? t("sampler.profilesHelp") : t("sampler.profilesHelpMember")}
        </Text>
        <View style={styles.profileTiles}>
          {profileCards.map((p) => (
            <Pressable key={p.id} style={pressStyle(styles.profileTile, "fadeLight")} onPress={() => openProfile(p)}>
              <ProfileCard name={p.name} createdAt={p.createdAt * 1000} compact />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  const deviceTiles: Tile[] = (devices ?? []).map((device) => {
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
      onPress: isAdmin || device.id === thisDeviceId ? () => setSelectedDeviceId(device.id) : undefined,
    };
  });

  //home shows it without the red button
  const renderDevicesCard = (withAction: boolean) => (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>{t("settings.hub.devices")}</Text>
        {devices ? (
          renderTiles(deviceTiles)
        ) : (
          <Text style={styles.helpText}>{t("settings.hub.devicesEmpty")}</Text>
        )}
        {withAction && (
          <View style={{ marginTop: Spacing.md }}>
            <Group style={styles.highlightGroup}>
              <ActionButton
                icon={addIcon}
                label={t("settings.hub.addMyDevice")}
                variant="highlight"
                onPress={() => setQrMode("link")}
              />
            </Group>
          </View>
        )}
      </View>
    </View>
  );

  const modelsSection = (highlight: boolean) => (
    <HubModelsSection
      highlight={highlight}
      onAddModel={() => setModelsSheetVisible(true)}
      onOpenModel={(file, name) => {
        setPage("models");
        setDetail({ kind: "model", file, name });
      }}
    />
  );

  const mcpSection = (highlight: boolean) => (
    <HubMcpSection
      highlight={highlight}
      onAddServer={() => setMcpSheetVisible(true)}
      onOpenServer={(id, title) => {
        setPage("mcp");
        setDetail({ kind: "mcp", id, title });
      }}
    />
  );

  const renderHome = () => {
    const cards = [
      <View key="profiles">{profilesCard}</View>,
      <View key="devices">{renderDevicesCard(false)}</View>,
      ...(showModels ? [<View key="models">{modelsSection(false)}</View>] : []),
      ...(showMcp ? [<View key="mcp">{mcpSection(false)}</View>] : []),
    ];
    if (pageWidth < TWO_COLUMNS_FROM) return cards;
    //two columns that fill independently
    const half = Math.floor((pageWidth - Spacing.xxl2) / 2);
    return (
      <View style={styles.columns}>
        <View style={{ width: half }}>{cards.filter((_, i) => i % 2 === 0)}</View>
        <View style={{ width: half }}>{cards.filter((_, i) => i % 2 === 1)}</View>
      </View>
    );
  };

  const renderProfiles = () => (
    <>
      {profilesCard}
      {isAdmin && (
        <Group style={styles.groupSpacing}>
          <ActionButton icon={hyperlinkIcon} label={t("settings.hub.pairDevice")} onPress={() => setQrMode("invite")} />
        </Group>
      )}
      {renderDevicesCard(true)}
    </>
  );

  const renderModels = () => (
    <>
      {settings && (
        <View style={styles.contentCard}>
          {renderToggleRow(
            t("settings.hub.shareProviders"),
            t("settings.hub.shareProvidersHelp"),
            settings.shareProviders,
            (value) => changeSettings({ shareProviders: value }),
          )}
        </View>
      )}
      {modelsSection(true)}
    </>
  );

  const renderMcp = () => (
    <>
      {mcpSection(true)}
      {isAdmin && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>{t("sampler.mcpAll")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {overview?.length === 0 ? t("sampler.mcpAllEmpty") : t("sampler.mcpAllHelp")}
            </Text>
            {!!overview?.length &&
              renderTiles(
                overview.map((server) => ({
                  key: server.id,
                  title: server.title,
                  error: server.state === "failed",
                  status: [
                    ownerName(server.owner),
                    server.state === "running"
                      ? t("hubMcp.state.running", { count: server.tools })
                      : t(`hubMcp.state.${server.state}`),
                    server.usage ? formatBytes(server.usage.memory) : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                })),
              )}
          </View>
        </View>
      )}
    </>
  );

  const renderPreferences = () => {
    const connection = {
      checking: t("settings.hub.checking"),
      offline: t("settings.hub.offline"),
      revoked: t("settings.hub.offline"),
      outdated: t("settings.hub.outdated"),
      online: status?.direct ? t("settings.hub.direct") : t("settings.hub.relay"),
    }[hubState];
    const rows = [
      { label: t("settings.hub.name"), value: status?.name ?? pairedHub?.name ?? "" },
      { label: t("settings.hub.connection"), value: connection },
      ...(status ? [{ label: t("settings.hub.version"), value: status.version }] : []),
      ...(status?.memory != null
        ? [
            { label: t("settings.hub.cpu"), value: t("hubMcp.cpuValue", { value: Math.round(status.cpu ?? 0) }) },
            { label: t("settings.hub.memory"), value: formatBytes(status.memory) },
          ]
        : []),
      ...(status?.update
        ? [{ label: t("settings.hub.update"), value: t("settings.hub.updateAvailable", { version: status.update }) }]
        : []),
    ];
    return (
      <>
        {hostingCard}

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
                    <ActionButton key={url} icon={binIcon} label={url} onPress={() => confirmRemoveRegistry(url)} />
                  ))}
                </Group>
              )}
              <Group>
                <TextInputField
                  icon={serverIcon}
                  placeholder="https://registry.example.com"
                  value={registryDraft}
                  onChangeText={setRegistryDraft}
                  onSubmitEditing={() => registryDraft.trim() && saveRegistries([...registries, registryDraft.trim()])}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <ActionButton
                  icon={addIcon}
                  label={t("sampler.addRegistry")}
                  disabled={!registryDraft.trim()}
                  onPress={() => saveRegistries([...registries, registryDraft.trim()])}
                />
              </Group>
            </View>
          </View>
        )}

        {/* hub info, then its actions */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group style={[styles.infoGroup, styles.groupSpacingTight]}>
              {rows.map((row) => (
                <ActionButton
                  key={row.label}
                  label={row.label}
                  rightElement={
                    <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
                      {row.value}
                    </Text>
                  }
                />
              ))}
            </Group>
            <Group>
              {status?.update && isAdmin && OperaHub.canUpdateHub() && (
                <ActionButton
                  icon={downloadIcon}
                  label={t("settings.hub.installUpdate")}
                  onPress={() => installUpdate(status.update!)}
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
              <ActionButton icon={cancelIcon} label={t("settings.hub.unpair")} onPress={unpair} />
            </Group>
          </View>
        </View>
      </>
    );
  };

  const renderDetail = (shown: Detail) => (
    <>
      <View style={styles.header}>
        <View style={styles.headerSpacer}>
          <DrawerBackButton kind="back" onPress={() => setDetail(null)} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {shown.kind === "model" ? shown.name : shown.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      {shown.kind === "model" ? (
        <HubModelPage file={shown.file} onDeleted={() => setDetail(null)} />
      ) : (
        <HubMcpServerPage
          id={shown.id}
          onRemoved={() => setDetail(null)}
          onPickFolder={(start, done) => setFolderPick({ start, done })}
        />
      )}
    </>
  );

  const navItems: { page: Page; icon: ImageSourcePropType; title: string; subtitle: string }[] = [
    { page: "home", icon: samplerIcon, title: t("sampler.nav.home"), subtitle: t("sampler.nav.homeHelp") },
    { page: "profiles", icon: profilIcon, title: t("sampler.nav.profiles"), subtitle: t("sampler.nav.profilesHelp") },
    ...(showModels
      ? [{ page: "models" as const, icon: brainIcon, title: t("hubModels.pageTitle"), subtitle: t("sampler.nav.modelsHelp") }]
      : []),
    ...(showMcp
      ? [{ page: "mcp" as const, icon: toolIcon, title: t("hubMcp.pageTitle"), subtitle: t("sampler.nav.mcpHelp") }]
      : []),
    {
      page: "preferences",
      icon: settingsIcon,
      title: t("sampler.nav.preferences"),
      subtitle: t("sampler.nav.preferencesHelp"),
    },
  ];
  //a page the role no longer opens falls back home
  const shownPage = navItems.some((item) => item.page === page) ? page : "home";

  const renderPage = () => {
    if (firstCheck) return null;
    if (detail && online) return renderDetail(detail);
    if (shownPage === "preferences") return renderPreferences();
    if (!online) return renderUnreachable();
    switch (shownPage) {
      case "profiles":
        return renderProfiles();
      case "models":
        return renderModels();
      case "mcp":
        return renderMcp();
      default:
        return renderHome();
    }
  };

  //not hosting yet, or no profile on this hub
  const renderWelcome = () => {
    const needsProfile = !!pairedHub;
    if (needsProfile && firstCheck) return null;
    if (needsProfile && !online) {
      return <View style={styles.welcomeCard}>{renderUnreachable()}</View>;
    }
    return (
      <View style={styles.welcome}>
        <Text style={styles.welcomeText}>{t("sampler.welcome")}</Text>
        {!!hostError && !needsProfile && <Text style={styles.welcomeHelp}>{hostError}</Text>}
        {needsProfile && <Text style={styles.welcomeHelp}>{t("settings.hub.noProfileHelp")}</Text>}
        <View style={styles.welcomeAction}>
          <Group style={[styles.highlightGroup, hostBusy && styles.highlightGroupDisabled]}>
            <ActionButton
              icon={needsProfile ? hyperlinkIcon : samplerIcon}
              label={needsProfile ? t("settings.hub.chooseProfile") : t("sampler.startHosting")}
              variant="highlight"
              disabled={hostBusy}
              onPress={needsProfile ? () => setProfileSheet("pick") : startHosting}
            />
          </Group>
        </View>
      </View>
    );
  };

  const ready = !!pairedHub && !!profile;

  return (
    <View style={styles.root}>
      {ready && (
        <View style={styles.nav}>
          <Group style={[styles.groupSpacing, styles.navGroup]}>
            {navItems.map((item) => (
              <Pressable
                key={item.page}
                style={pressStyle(
                  [styles.navItem, shownPage === item.page && styles.navItemPressed],
                  styles.navItemPressed,
                )}
                onPress={() => openPage(item.page)}
              >
                <View style={styles.menuIconWrap}>
                  <Image source={item.icon} style={styles.menuIcon} tintColor={Colors.textOnPrimary} />
                </View>
                <View style={styles.navTextContainer}>
                  <Text style={styles.navTitle}>{item.title}</Text>
                  <Text style={styles.navSubtitle}>{item.subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </Group>
        </View>
      )}

      <View style={styles.main}>
        {loaded &&
          (ready ? (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View
                style={styles.page}
                onLayout={(e) => {
                  const width = e.nativeEvent.layout.width;
                  if (width > 0 && width !== pageWidth) setPageWidth(width);
                }}
              >
                {renderPage()}
              </View>
            </ScrollView>
          ) : (
            renderWelcome()
          ))}
        <View style={styles.topBar} pointerEvents="box-none">
          {topBar}
        </View>
      </View>

      <HubProfileSheet
        visible={profileSheet !== null}
        hub={pairedHub}
        changePassword={profileSheet === "password"}
        defaultName={Settings.getCached().name}
        onClose={() => setProfileSheet(null)}
        onDone={handleProfileDone}
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
      <HubDeviceSheet
        device={devices?.find((d) => d.id === selectedDeviceId) ?? null}
        hub={pairedHub}
        isSelf={selectedDeviceId === thisDeviceId}
        canManage={isAdmin}
        onClose={() => setSelectedDeviceId(null)}
        onChanged={refresh}
        onUnpairSelf={() => {
          setSelectedDeviceId(null);
          unpair();
        }}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <HubModelsSheet
        visible={modelsSheetVisible}
        onClose={() => setModelsSheetVisible(false)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
      <HubMcpSheet
        visible={mcpSheetVisible}
        onClose={() => setMcpSheetVisible(false)}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
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
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      flexDirection: "row",
    },
    //same frame as the docked discussions
    nav: {
      width: NAV_WIDTH,
      backgroundColor: Colors.groupedBackground,
      borderRightWidth: 2,
      borderRightColor: Colors.border,
      paddingTop: CONTENT_TOP,
      paddingHorizontal: Spacing.lg2,
    },
    navGroup: {
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
    },
    main: {
      flex: 1,
    },
    topBar: {
      position: "absolute",
      top: isTauri ? 32 : 0,
      left: 0,
      right: 0,
    },
    scroll: {
      paddingTop: CONTENT_TOP,
      paddingBottom: 40,
      paddingHorizontal: Spacing.xxl2,
    },
    page: {
      width: "100%",
      maxWidth: PAGE_MAX_WIDTH,
      alignSelf: "center",
    },
    columns: {
      flexDirection: "row",
      gap: Spacing.xxl2,
    },
    welcome: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: Spacing.xxl2,
    },
    welcomeCard: {
      flex: 1,
      justifyContent: "center",
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
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
    groupSpacing: {
      marginBottom: Spacing.xxl,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
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
    navItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    navItemPressed: {
      backgroundColor: Colors.surfacePressed,
    },
    menuIcon: {
      width: 18,
      height: 18,
    },
    menuIconWrap: {
      width: 36,
      height: 36,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.primary,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      alignItems: "center",
      justifyContent: "center",
    },
    navTextContainer: {
      flex: 1,
    },
    navTitle: {
      fontSize: FontSizes.lg,
      fontFamily: Fonts.mono,
      color: Colors.textPrimary,
      marginBottom: Spacing.xs2,
    },
    navSubtitle: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.body,
      color: Colors.textMuted,
    },
    profileTiles: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
    },
    profileTile: {
      width: PROFILE_TILE_WIDTH,
      borderRadius: Radius.xl,
    },
    //same tile as the settings card grid
    tiles: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
    },
    tile: {
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.lg,
      minHeight: 76,
      justifyContent: "center",
      alignItems: "center",
    },
    tileIcon: {
      width: 32,
      height: 32,
      marginBottom: Spacing.md,
    },
    tileTitle: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      lineHeight: 18,
      color: Colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.xs,
    },
    tileStatus: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      textAlign: "center",
    },
  });
