import * as Calendar from "expo-calendar";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Image,
  ImageSourcePropType,
  Keyboard,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef, releaseCapture } from "react-native-view-shot";
import {
  MODEL_CAPABILITY_KEYS,
  type ModelCapabilityId,
} from "../../../constants/modelCapabilities";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { AIModule } from "../../services/ai/AIModule";
import { contextFloorTokens } from "../../services/ai/generation/chatGeneration";
import {
  CatalogEntry,
  familyPublisher,
  fetchCatalogEntry,
  fetchFamilies,
  fetchModelDescription,
  formatBytes,
  getCachedFamilies,
  getCatalogEntry,
  hydrateLiteRTCatalog,
  MIN_SEARCH_LENGTH,
  modelAvatarUrl,
  ModelFamily,
  OTHER_FAMILY_ID,
  sameFamilyModels,
  searchModels,
  similarModels,
} from "../../services/ai/providers/huggingFaceCatalog";
import {
  cancelLiteRTDownload,
  deleteLiteRTModel,
  downloadLiteRTModel,
  getInstalledLiteRTModels,
  getLiteRTModelLabel,
  getPendingLiteRTDownload,
  isLiteRTModelDownloaded,
  LiteRTDownloadCancelled,
  LiteRTDownloadSnapshot,
  LiteRTModelInfo,
  subscribeLiteRTDownload,
} from "../../services/ai/providers/LiteRTProvider";
import { LocalModelSheet } from "../../services/ai/providers/LocalProvider";
import {
  BETA_PROVIDER_ID,
  BETA_SERVER_URL,
  buildSources,
  getEnabledProviders,
  getOllamaServers,
  getOllamaTuning,
  getOpenAIApiKeyById,
  getHubName,
  getHubServers,
  getOpenAIServers,
  getPromptTierOverride,
  HUB_PROVIDER_ID,
  patchHubServer,
  isProviderSupported,
  newOpenAIServerId,
  OllamaServer,
  OPENAI_PROVIDER_ID,
  openAIServerNames,
  PROMPT_TIERS,
  type PromptTier,
  serializeServers,
  serializeProviders,
  setOpenAIApiKey,
} from "../../services/ai/providers/sources";
import { OpenAIProvider } from "../../services/ai/providers/OpenAIProvider";
import {
  parseQuickFlowOptionId,
  quickFlowOptionId,
} from "../../services/ai/quickFlow";
import { ITool } from "../../services/ai/tools/ITool";
import { ToolManager } from "../../services/ai/tools/ToolManager";
import {
  isDefaultAssistant,
  openAssistantSettings,
} from "../../services/assistant/DefaultAssistant";
import { BackupService } from "../../services/BackupService";
import { CloudUserInfo } from "../../services/cloud/CloudProvider";
import {
  CLOUD_PROVIDERS,
  getCloudProviderDefinition,
} from "../../services/cloud/registry";
import { CloudSync } from "../../services/CloudSyncService";
import {
  HubProfile,
  HubStatus,
  SamplerHub,
  PairedHub,
} from "../../services/hub/SamplerHubService";
import { HubSync } from "../../services/hub/HubSync";
import { SyncPrefs, SyncPrefsStore } from "../../services/SyncPrefs";
import { AppEvents } from "../../services/events";
import { McpService } from "../../services/mcp/McpService";
import { McpServerConfig } from "../../services/mcp/types";
import { PluginRegistry } from "../../services/plugins/PluginRegistry";
import { openScreenSaverSettings } from "../../services/screensaver/ScreenSaver";
import { AppSettings, Settings } from "../../services/settings/SettingsService";
import { STT, WhisperSTT } from "../../services/speech/STTService";
import { TTS_SPEEDS } from "../../services/speech/engines";
import ActionButton from "../ui/ActionButton";
import CardGrid, { type GridCard } from "../ui/CardGrid";
import Checkbox from "../ui/Checkbox";
import DownloadProgress, { throttleProgress } from "../ui/DownloadProgress";
import Group from "../ui/Group";
import NotificationBanner from "../ui/NotificationBanner";
import NotificationModal, { ModalButton } from "../ui/NotificationModal";
import ProgressBar from "../ui/ProgressBar";
import IconSelector from "../ui/IconSelector";
import Selector, { SelectorOption } from "../ui/Selector";
import Slider from "../ui/Slider";
import SliderToggle from "../ui/SliderToggle";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import DrawerSheet, {
  SheetBody,
  SheetKeyboardAwareScrollView,
  SheetScrollView,
} from "./DrawerSheet";
import {
  CTX_SIZE_OPTIONS,
  KEEP_ALIVE_OPTIONS,
  LLAMA_SERVER_URL,
  PARALLEL_OPTIONS,
  optionLabel,
} from "../../services/hub/modelOptions";
import MaestroCard from "./MaestroCard";
import { BUTTERFLY_OPTIONS, selectButterfly, useMaestroButterfly } from "./maestroButterfly";
import VoiceEngineCard from "./VoiceEngineCard";
import ProfileCard from "./ProfileCard";

import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";
import { useResponsive } from "../../hooks/useResponsive";
import { useSettingsNotices } from "../../hooks/useSettingsNotices";
import { useVoicePackInstalled } from "../../hooks/useVoicePackInstalled";

import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useBugReport } from "../../hooks/useBugReport";
import { setThemeMode, useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT, type TranslationKey } from "../../i18n";
import { pressStyle } from "../ui/pressStyle";
import {
  dragDrawer,
  drawerWidthFor,
  gestureVelocity,
  releaseOpens,
  settingsProgress,
  settleDrawer,
  settleLayoutDrawer,
} from "./drawerAnimation";
import DrawerBackButton from "./DrawerBackButton";
import PageStack from "./PageStack";

const linkIcon = require("../../../assets/icons/link.png");
const addIcon = require("../../../assets/icons/add.png");
const downloadIcon = require("../../../assets/icons/download.png");
const deleteIcon = require("../../../assets/icons/delete.png");
const penPlaceholderIcon = require("../../../assets/icons/pencil.png");
const keyIcon = require("../../../assets/icons/key.png");

//tools and video stay hidden here
const LITERT_CAPABILITY_IDS: readonly ModelCapabilityId[] = [
  "vision",
  "audio",
  "thinking",
];
const searchIcon =require("../../../assets/icons/search.png");
const profilIcon = require("../../../assets/icons/profil.png");
const cloudIcon = require("../../../assets/icons/cloud.png");
const cloudUploadIcon = require("../../../assets/icons/cloudupload.png");
const cloudDownloadIcon = require("../../../assets/icons/clouddownload.png");
const arrowIcon = require("../../../assets/icons/arrow.png");
const rightArrowIcon = require("../../../assets/icons/right.png");
const cancelIcon = require("../../../assets/icons/cancel.png");
const activateIcon = require("../../../assets/icons/activate.png");
const generalIcon = require("../../../assets/icons/general.png");
const advancedIcon = require("../../../assets/icons/settings.png");
const serverIcon = require("../../../assets/icons/server.png");
const toolIcon = require("../../../assets/icons/tool.png");
const tool2Icon = require("../../../assets/icons/tool2.png");
const confidentialityIcon = require("../../../assets/icons/confidentiality.png");
const reportsIcon = require("../../../assets/icons/bug.png");
const supportIcon = require("../../../assets/icons/support.png");
const informationIcon = require("../../../assets/icons/information.png");
const githubIcon = require("../../../assets/icons/github.png");
const operaIcon = require("../../../assets/icons/operaicon.png");
const samplerIcon = require("../../../assets/icons/operaicon5.png");
const instagramIcon = require("../../../assets/icons/instagram.png");
const tiktokIcon = require("../../../assets/icons/tiktok.png");
const micIcon = require("../../../assets/icons/microphone.png");
const cameraIcon = require("../../../assets/icons/camera.png");
const videocamIcon = require("../../../assets/icons/videocam.png");
const visionIcon = require("../../../assets/icons/vision.png");
const microIcon = require("../../../assets/icons/micro.png");
const brainIcon = require("../../../assets/icons/brain.png");
//icon set differs from the sheet
const MODEL_CAPABILITY_ICONS = {
  tools: tool2Icon,
  vision: visionIcon,
  thinking: brainIcon,
  audio: microIcon,
  video: videocamIcon,
} as const satisfies Record<ModelCapabilityId, ImageSourcePropType>;
const photoIcon = require("../../../assets/icons/photo.png");
const locationIcon = require("../../../assets/icons/location.png");
const calendarIcon = require("../../../assets/icons/calendar.png");
const binIcon = require("../../../assets/icons/bin.png");
const exportIcon = require("../../../assets/icons/export.png");
const messageIcon = require("../../../assets/icons/message.png");
const timeIcon = require("../../../assets/icons/time.png");
const errorIcon = require("../../../assets/icons/error.png");
const errorImage = require("../../../assets/images/ImageCard/error.png");
const infoIcon = require("../../../assets/icons/info.png");
const reconnectIcon = require("../../../assets/icons/reconnect.png");
const hyperlinkIcon = require("../../../assets/icons/hyperlink2.png");

const DRAWER_SYNC_DELAY_MS = 1500;
//hub entry in the account list
const HUB_SYNC_ID = "hub";

//plugin help shows the first sentence only
function shortDescription(text: string) {
  const first = text
    .trim()
    .split(/\.\s|\n/)[0]
    .replace(/[\s.:;,]+$/, "");
  return first ? `${first}.` : "";
}

const appVersion = Constants.expoConfig?.version ?? "1.0.0";

const MOBILE_TOOL_NAMES = new Set([
  "contact",
  "calendar",
  "settings",
  "timer",
  "clipboard",
  "send_message",
  "open_app",
]);

type SettingsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  //fills its own os window instead of floating over the app
  windowed?: boolean;
  initialSubPage?: SubPage;
  //an opera://hub/pair link to confirm
  hubPairLink?: string | null;
  onHubPairLinkHandled?: () => void;
};

export type SubPage =
  | "main"
  | "general"
  | "advanced"
  | "maestro"
  | "maestropreferences"
  | "assistantoverlay"
  | "screensaver"
  | "service"
  | "beta"
  | "litert"
  | "ollama"
  | "openai"
  | "confidentiality"
  | "reports"
  | "tools"
  | "profile"
  | "cloud"
  | "hubprovider"
  | "mcpservers"
  | "mcpserver"
  | "mcpserversettings"
  | "sociallinks";

//page a subpage steps back to, followed by the header arrow and the android back button
const SUB_PAGE_PARENT: Record<SubPage, SubPage> = {
  main: "main",
  general: "main",
  advanced: "main",
  maestro: "main",
  maestropreferences: "maestro",
  assistantoverlay: "general",
  screensaver: "general",
  service: "main",
  beta: "service",
  litert: "service",
  ollama: "service",
  openai: "service",
  confidentiality: "main",
  reports: "main",
  tools: "main",
  profile: "main",
  cloud: "main",
  hubprovider: "service",
  sociallinks: "main",
  mcpservers: "tools",
  mcpserver: "mcpservers",
  mcpserversettings: "mcpserver",
};

const subPageParent = (page: SubPage) =>
  page === "main" ? null : SUB_PAGE_PARENT[page];

//nav entry a subpage lives under
const sectionOf = (page: SubPage): SubPage => {
  let p = page;
  while (SUB_PAGE_PARENT[p] !== "main") p = SUB_PAGE_PARENT[p];
  return p;
};

//desktop always shows a page next to the nav
const DESKTOP_ENTRY_PAGE: SubPage = "general";
//settings rows stay readable on wide screens
const DESKTOP_WINDOW_MAX_WIDTH = 960;
//slider beside its text on desktop
const SLIDER_WIDTH = 320;

type LitertPage = "browse" | "search" | "model";
type CloudModelsPage = "server" | "list" | "model";

const MODEL_PAGE_SIZE = 50;
//cloud page previews before the full sheet
const MODEL_PREVIEW_SIZE = 10;
const NO_DISABLED_MODELS: string[] = [];
const NO_CAPABILITY_OVERRIDES: Record<string, string[]> = {};
const NO_PROMPT_TIERS: Record<string, PromptTier> = {};
const PROMPT_TIER_KEYS = {
  small: "settings.model.promptSmall",
  medium: "settings.model.promptMedium",
  large: "settings.model.promptLarge",
} as const satisfies Record<PromptTier, TranslationKey>;
const MODEL_CAPABILITY_ROWS = [
  "tools",
  "vision",
  "thinking",
  "audio",
  "video",
] as const satisfies readonly ModelCapabilityId[];

//override wins over server caps
const ModelCapabilityToggles = memo(function ModelCapabilityToggles({
  model,
  service,
  url,
  onCapabilitiesChange,
  onPromptTierChange,
  style,
  labelStyle,
  checkboxes = false,
}: {
  model: string;
  service: string;
  url: string;
  onCapabilitiesChange: (model: string, capabilities: string[]) => void;
  onPromptTierChange: (model: string, tier: PromptTier | undefined) => void;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<ViewStyle>;
  checkboxes?: boolean;
}) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const [capabilities, setCapabilities] = useState<string[] | null>(null);
  const [promptTier, setPromptTier] = useState<string>(
    () => getPromptTierOverride(service, url, model) ?? "auto",
  );
  const promptOptions: SelectorOption[] = [
    { id: "auto", label: t("settings.model.promptAuto") },
    ...PROMPT_TIERS.map((tier) => ({
      id: tier,
      label: t(PROMPT_TIER_KEYS[tier]),
    })),
  ];

  useEffect(() => {
    let cancelled = false;
    AIModule.getModelCapabilitiesFor(service, url, model)
      .catch(() => [] as string[])
      .then((caps) => {
        if (!cancelled) setCapabilities(caps);
      });
    return () => {
      cancelled = true;
    };
  }, [service, url, model]);

  const toggleCapability = (id: string, on: boolean) => {
    const current = capabilities ?? [];
    const next = MODEL_CAPABILITY_ROWS.filter((c) =>
      c === id ? on : current.includes(c),
    );
    setCapabilities(next);
    onCapabilitiesChange(model, next);
  };

  if (!capabilities) return null;
  return (
    <View style={style}>
      {MODEL_CAPABILITY_ROWS.map((c) => (
        <View key={c} style={styles.toggleGroupRow}>
          <View style={[styles.litertCapability, labelStyle]}>
            <Image
              source={MODEL_CAPABILITY_ICONS[c]}
              style={styles.litertCapabilityIcon}
              tintColor={Colors.textSecondary}
            />
            <Text style={styles.litertDetailMeta}>
              {t(MODEL_CAPABILITY_KEYS[c])}
            </Text>
          </View>
          {checkboxes ? (
            <Checkbox
              checked={capabilities.includes(c)}
              onToggle={(v) => toggleCapability(c, v)}
            />
          ) : (
            <Toggle
              checked={capabilities.includes(c)}
              onToggle={(v) => toggleCapability(c, v)}
            />
          )}
        </View>
      ))}
      <Text style={[styles.settingLabel, styles.litertDetailSection]}>
        {t("settings.model.promptSize")}
      </Text>
      <Group>
        <Selector
          options={promptOptions}
          selectedValue={promptTier}
          onSelect={(v) => {
            setPromptTier(v);
            onPromptTierChange(model, v === "auto" ? undefined : (v as PromptTier));
          }}
          title={t("settings.model.promptSize")}
          fullWidth
        />
      </Group>
    </View>
  );
});

const ModelToggleRow = memo(function ModelToggleRow({
  model,
  enabled,
  last,
  expanded,
  service,
  url,
  onToggle,
  onExpand,
  onCapabilitiesChange,
  onPromptTierChange,
}: {
  model: string;
  enabled: boolean;
  last: boolean;
  expanded: boolean;
  service: string;
  url: string;
  onToggle: (model: string, enabled: boolean) => void;
  onExpand: (model: string) => void;
  onCapabilitiesChange: (model: string, capabilities: string[]) => void;
  onPromptTierChange: (model: string, tier: PromptTier | undefined) => void;
}) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={!last && { marginBottom: Spacing.lg }}>
      <View style={styles.toggleGroupRow}>
        <Pressable
          style={pressStyle(styles.modelToggleName, "fadeLight")}
          onPress={() => onExpand(model)}
        >
          <Text style={[styles.settingLabel, styles.modelToggleLabel]} numberOfLines={1}>
            {model}
          </Text>
          <Image
            source={rightArrowIcon}
            style={[styles.litertCapabilityIcon, expanded && styles.modelToggleArrowOpen]}
            tintColor={Colors.textMuted}
          />
        </Pressable>
        <Checkbox checked={enabled} onToggle={(v) => onToggle(model, v)} />
      </View>
      {expanded && (
        <ModelCapabilityToggles
          model={model}
          service={service}
          url={url}
          onCapabilitiesChange={onCapabilitiesChange}
          onPromptTierChange={onPromptTierChange}
          style={styles.modelCapabilities}
        />
      )}
    </View>
  );
});

//local search avoids drawer redraws
const ModelToggleList = memo(function ModelToggleList({
  models,
  loading,
  service,
  url,
  disabled = NO_DISABLED_MODELS,
  capabilities = NO_CAPABILITY_OVERRIDES,
  onChange,
  onCapabilitiesChange,
  promptTiers = NO_PROMPT_TIERS,
  onPromptTiersChange,
  onShowAll,
  onOpenModel,
  onOpenSearch,
  showAll = false,
  autoFocusSearch = false,
  onSearchFocus,
  hideSearch = false,
  searchQuery,
}: {
  models: string[];
  loading: boolean;
  service: string;
  url: string;
  disabled?: string[];
  capabilities?: Record<string, string[]>;
  onChange: (next: string[]) => void;
  //only the inline expand edits capabilities
  onCapabilitiesChange?: (next: Record<string, string[]>) => void;
  promptTiers?: Record<string, PromptTier>;
  onPromptTiersChange?: (next: Record<string, PromptTier>) => void;
  //show more opens the full list instead of paging
  onShowAll?: (search: string) => void;
  //rows open a model page instead of expanding
  onOpenModel?: (model: string) => void;
  //search opens full models sheet
  onOpenSearch?: () => void;
  showAll?: boolean;
  autoFocusSearch?: boolean;
  onSearchFocus?: () => void;
  //search input moved outside the card
  hideSearch?: boolean;
  searchQuery?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const pageSize = showAll
    ? Infinity
    : onShowAll
      ? MODEL_PREVIEW_SIZE
      : MODEL_PAGE_SIZE;
  const [localSearch, setLocalSearch] = useState("");
  const search = searchQuery !== undefined ? searchQuery : localSearch;
  const [limit, setLimit] = useState(pageSize);

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? models.filter((m) => m.toLowerCase().includes(query))
      : models;
  }, [models, search]);
  const enabledCount = models.filter((m) => !disabledSet.has(m)).length;

  //stable handler keeps memo rows still
  const latest = useRef({
    disabled,
    onChange,
    capabilities,
    onCapabilitiesChange,
    promptTiers,
    onPromptTiersChange,
  });
  useEffect(() => {
    latest.current = {
      disabled,
      onChange,
      capabilities,
      onCapabilitiesChange,
      promptTiers,
      onPromptTiersChange,
    };
  });
  const toggleModel = useCallback((model: string, enabled: boolean) => {
    const { disabled: current, onChange: save } = latest.current;
    save(enabled ? current.filter((m) => m !== model) : [...current, model]);
  }, []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleExpanded = useCallback((model: string) => {
    setExpanded((current) => (current === model ? null : model));
  }, []);
  const setModelCapabilities = useCallback((model: string, caps: string[]) => {
    const { capabilities: current, onCapabilitiesChange: save } = latest.current;
    save?.({ ...current, [model]: caps });
  }, []);
  const setModelPromptTier = useCallback(
    (model: string, tier: PromptTier | undefined) => {
      const { promptTiers: current, onPromptTiersChange: save } = latest.current;
      //auto removes the override
      const { [model]: _removed, ...rest } = current;
      save?.(tier ? { ...rest, [model]: tier } : rest);
    },
    [],
  );

  //bulk buttons act on the filtered rows
  const setShown = (enabled: boolean) => {
    const shownSet = new Set(shown);
    onChange(
      enabled
        ? disabled.filter((m) => !shownSet.has(m))
        : [...new Set([...disabled, ...shown])],
    );
  };

  const visible = shown.slice(0, limit);

  return (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
          {models.length > 0
            ? t("settings.ollama.modelsCount", {
                count: `${enabledCount}/${models.length}`,
              })
            : t("settings.ollama.models")}
        </Text>
        {models.length === 0 ? (
          <Text style={styles.helpText}>
            {loading
              ? t("settings.ollama.modelsLoading")
              : t("settings.ollama.noModels")}
          </Text>
        ) : (
          <>
            {!hideSearch && (
              <Group style={styles.groupSpacingTight}>
                {onOpenSearch ? (
                  <ActionButton
                    icon={searchIcon}
                    label={t("settings.ollama.searchModels")}
                    onPress={onOpenSearch}
                  />
                ) : (
                  <TextInputField
                    icon={searchIcon}
                    placeholder={t("settings.ollama.searchModels")}
                    value={search}
                    onChangeText={(v) => {
                      setLocalSearch(v);
                      setLimit(pageSize);
                    }}
                    autoFocus={autoFocusSearch}
                    onFocus={onSearchFocus}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
              </Group>
            )}
            <Group style={{ marginBottom: Spacing.xxl }}>
              <ActionButton
                icon={activateIcon}
                label={t("settings.ollama.enableAll")}
                disabled={shown.every((m) => !disabledSet.has(m))}
                onPress={() => setShown(true)}
              />
              <ActionButton
                icon={cancelIcon}
                label={t("settings.ollama.disableAll")}
                disabled={shown.every((m) => disabledSet.has(m))}
                onPress={() => setShown(false)}
              />
            </Group>
            {shown.length === 0 ? (
              <Text style={styles.helpText}>{t("settings.ollama.noMatch")}</Text>
            ) : (
              visible.map((model, index) => (
                <ModelToggleRow
                  key={model}
                  model={model}
                  enabled={!disabledSet.has(model)}
                  last={index === visible.length - 1}
                  expanded={expanded === model}
                  service={service}
                  url={url}
                  onToggle={toggleModel}
                  onExpand={onOpenModel ?? toggleExpanded}
                  onCapabilitiesChange={setModelCapabilities}
                  onPromptTierChange={setModelPromptTier}
                />
              ))
            )}
            {shown.length > limit && (
              <Group style={{ marginTop: Spacing.xxl }}>
                <ActionButton
                  icon={addIcon}
                  label={t("settings.ollama.showMore", {
                    count: shown.length - limit,
                  })}
                  onPress={
                    onShowAll
                      ? () => onShowAll(search)
                      : () => setLimit((l) => l + pageSize)
                  }
                />
              </Group>
            )}
          </>
        )}
      </View>
    </View>
  );
});

export default function SettingsDrawer({
  visible,
  onClose,
  onDataChanged,
  isLargeScreen = false,
  isDesktop = false,
  windowed = false,
  initialSubPage,
  hubPairLink = null,
  onHubPairLinkHandled,
}: SettingsDrawerProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { width } = useResponsive();
  const drawerWidth = drawerWidthFor(width);
  const progress = settingsProgress;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            gestureState.dx > 10 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
          );
        },
        onPanResponderMove: (_, gestureState) => {
          dragDrawer(progress, 1 - gestureState.dx / drawerWidth);
        },
        onPanResponderRelease: (_, gestureState) => {
          const open = releaseOpens(
            1 - gestureState.dx / drawerWidth,
            -gestureState.vx,
          );
          settleDrawer(
            progress,
            open,
            -gestureVelocity(gestureState.vx, drawerWidth),
          );
          if (!open) onClose();
        },
        onPanResponderTerminate: () => {
          settleDrawer(progress, true);
        },
      }),
    [onClose, drawerWidth, progress],
  );

  const [activeSubPage, setActiveSubPage] = useState<SubPage>(
    initialSubPage ?? "main",
  );

  //entry page swaps in before paint, never while sliding out
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevInitialSubPage, setPrevInitialSubPage] = useState(initialSubPage);
  if (visible !== prevVisible || initialSubPage !== prevInitialSubPage) {
    setPrevVisible(visible);
    setPrevInitialSubPage(initialSubPage);
    if (visible) setActiveSubPage(initialSubPage ?? "main");
  }

  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    //page stays mounted while closing, its input would keep the keyboard
    if (!visible && wasVisibleRef.current) Keyboard.dismiss();
    wasVisibleRef.current = visible;
  }, [visible]);

  //native back navigates back in the menu, then lets parent close the drawer
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activeSubPage === "main") return false;
      setActiveSubPage(SUB_PAGE_PARENT[activeSubPage]);
      return true;
    });
    return () => sub.remove();
  }, [visible, activeSubPage]);

  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);

  const handleBack = useCallback(() => {
    if (activeSubPage === "main") {
      onClose();
    } else {
      setActiveSubPage(SUB_PAGE_PARENT[activeSubPage]);
    }
  }, [activeSubPage, onClose]);

  useEffect(() => {
    //a jump while sliding out would show
    if (!visible) return;
    setIsScrolled(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeSubPage, visible]);

  //detect scroll to morph button
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const scrolled = y > 10;
      setIsScrolled((prev) => (prev !== scrolled ? scrolled : prev));
    },
    [],
  );

  const [language, setLanguageState] = useState("en");
  const [theme, setThemeState] = useState("system");
  const [aiService, setAiServiceState] = useState("ollama");
  const [localAvailable, setLocalAvailable] = useState(false);
  const [localSheet, setLocalSheet] = useState<LocalModelSheet | null>(null);
  const [localDownload, setLocalDownload] = useState<{
    progress: number;
    sizeStr: string;
  } | null>(null);
  const [selectedLocalModelId, setSelectedLocalModelId] = useState<
    string | null
  >(null);
  const selectedLocalModel =
    localSheet?.models.find((m) => m.id === selectedLocalModelId) ?? null;
  const [ollamaUrl, setOllamaUrlState] = useState("");
  const [ollamaServers, setOllamaServersState] = useState<OllamaServer[]>([]);
  const [enabledProviders, setEnabledProvidersState] = useState<string[]>([]);
  const [modelFailover, setModelFailoverState] = useState(true);
  //unreachable server url
  const [serverErrors, setServerErrors] = useState<Record<string, boolean>>({});
  //opened server index in the list
  const [ollamaDetailIndex, setOllamaDetailIndex] = useState<number | null>(
    null,
  );
  //raw text of the tuning fields
  const [ollamaContextDraft, setOllamaContextDraft] = useState("");
  const [ollamaKeepAliveDraft, setOllamaKeepAliveDraft] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [hubDetailUrl, setHubDetailUrl] = useState<string | null>(null);
  //closing clears the url, the slide out keeps the last server
  const [shownHubUrl, setShownHubUrl] = useState<string | null>(null);
  if (hubDetailUrl !== null && hubDetailUrl !== shownHubUrl) {
    setShownHubUrl(hubDetailUrl);
  }
  //hub server prefs live outside react state
  const [, setHubPrefsTick] = useState(0);
  //ignore stale server answers
  const ollamaModelsRequest = useRef(0);
  const [openaiServers, setOpenAIServersState] = useState<OllamaServer[]>([]);
  const [openaiDetailIndex, setOpenAIDetailIndex] = useState<number | null>(
    null,
  );
  const [openaiModels, setOpenAIModels] = useState<string[]>([]);
  const [openaiModelsLoading, setOpenAIModelsLoading] = useState(false);
  const openaiModelsRequest = useRef(0);
  //key text saved on blur
  const [openaiKeyDraft, setOpenAIKeyDraft] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastSyncSize, setLastSyncSize] = useState<number | null>(null);

  const [addModelSheetVisible, setAddModelSheetVisible] = useState(false);
  const [ollamaAddVisible, setOllamaAddVisible] = useState(false);
  const [openaiAddVisible, setOpenAIAddVisible] = useState(false);
  const [openaiModelsPage, setOpenAIModelsPage] =
    useState<CloudModelsPage>("server");
  //model steps back to the page it came from
  const [openaiModelFrom, setOpenAIModelFrom] = useState<"server" | "list">(
    "server",
  );
  const [openaiModelDetail, setOpenAIModelDetail] = useState<string | null>(
    null,
  );
  const [openaiModelsScrolled, setOpenAIModelsScrolled] = useState(false);
  const [openaiModelsWidth, setOpenAIModelsWidth] = useState(320);
  const [openaiSearchQuery, setOpenAISearchQuery] = useState("");
  //model page search hands focus to the list
  const [openaiModelsSearchHandoff, setOpenAIModelsSearchHandoff] =
    useState(false);
  //query typed in the inline list before show more
  const [mcpAddVisible, setMcpAddVisible] = useState(false);
  const [profileEditVisible, setProfileEditVisible] = useState(false);
  const [litertDownloadVisible, setLitertDownloadVisible] = useState(false);
  //id outlives the close so the sheet keeps its content
  const [cloudSetupVisible, setCloudSetupVisible] = useState(false);
  const [cloudSetupId, setCloudSetupId] = useState("");
  const [addModelScrolled, setAddModelScrolled] = useState(false);
  const [litertPage, setLitertPage] = useState<LitertPage>("browse");
  //model steps back to the list it came from
  const [litertModelFrom, setLitertModelFrom] = useState<"browse" | "search">(
    "browse",
  );
  const [litertDetail, setLitertDetail] = useState<{
    repoId: string;
    entry: CatalogEntry | null;
    loading: boolean;
    //undefined while the card loads
    description?: string | null;
  } | null>(null);
  //installed model shown in detail sheet
  const [installedModel, setInstalledModel] = useState<{
    id: string;
    description?: string | null;
  } | null>(null);
  const addModelScrollRef = useRef<ScrollView>(null);
  const profileCardRef = useRef<View>(null);
  //measured width, the slide's push distance
  const [litertBodyWidth, setLitertBodyWidth] = useState(320);

  const hubSupported = SamplerHub.isSupported();
  const [pairedHub, setPairedHub] = useState<PairedHub | null>(null);
  const [hubStatus, setHubStatus] = useState<HubStatus | null>(null);
  //null until this device unlocks a profile
  const [hubProfile, setHubProfile] = useState<HubProfile | null>(null);
  const [syncPrefs, setSyncPrefs] = useState<SyncPrefs | null>(null);
  //another sync account was picked
  const [hubSyncPaused, setHubSyncPaused] = useState(false);
  //sampler syncs while the cloud keeps a daily backup
  const [cloudBackupMode, setCloudBackupMode] = useState(false);
  //backup turned on, its cloud not picked yet
  const [cloudBackupPicking, setCloudBackupPicking] = useState(false);

  const refreshHub = useCallback(async () => {
    const hub = await SamplerHub.getPairedHub();
    setPairedHub(hub);
    setHubProfile(await SamplerHub.getProfile());
    if (!hub) return;
    setHubSyncPaused(await HubSync.isPaused());
    SamplerHub.status(hub).then(setHubStatus).catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the paired hub
    if (visible && SamplerHub.isSupported()) refreshHub();
  }, [visible, refreshHub]);

  //open sheets keep the back press for themselves
  const sheetOpen =
    profileEditVisible ||
    addModelSheetVisible ||
    ollamaAddVisible ||
    ollamaDetailIndex !== null ||
    hubDetailUrl !== null ||
    openaiAddVisible ||
    openaiDetailIndex !== null ||
    mcpAddVisible ||
    litertDownloadVisible ||
    cloudSetupVisible ||
    selectedLocalModel !== null ||
    installedModel !== null;


  const [hfModelInput, setHfModelInput] = useState("");
  //entry fields hand their focus to the search page
  const [litertSearchHandoff, setLitertSearchHandoff] = useState(false);
  const [litertForceLoad, setLitertForceLoadState] = useState(false);
  const [litertContextLength, setLitertContextLengthState] = useState("8192");
  const [installedLitertModels, setInstalledLitertModels] = useState<
    LiteRTModelInfo[]
  >([]);
  const [downloadingLitert, setDownloadingLitert] = useState<string | null>(
    null,
  );
  const [litertDownloadProgress, setLitertDownloadProgress] =
    useState<LiteRTDownloadSnapshot | null>(null);
  //families browse as carousels
  const [litertFamilies, setLitertFamilies] = useState<ModelFamily[]>([]);
  const [litertSearchResults, setLitertSearchResults] = useState<
    CatalogEntry[]
  >([]);
  const [litertBrowserLoading, setLitertBrowserLoading] = useState(false);
  const [litertBrowserFailed, setLitertBrowserFailed] = useState(false);
  //kept apart so the catalog never shows a search state
  const [litertSearchLoading, setLitertSearchLoading] = useState(false);
  const [litertSearchFailed, setLitertSearchFailed] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //sheet may grow up to just under the status bar
  const sheetMaxHeight = windowHeight - insets.top - Spacing.xl2;
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [exportScopeVisible, setExportScopeVisible] = useState(false);
  const [exportSelection, setExportSelection] = useState({
    settings: true,
    conversations: true,
  });
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    icon?: ImageSourcePropType;
    image?: ImageSourcePropType;
    messageAlign?: "left" | "center";
    buttons?: ModalButton[];
    showInput?: boolean;
    inputValue?: string;
    onInputChange?: (text: string) => void;
    inputPlaceholder?: string;
    inputSecureTextEntry?: boolean;
    inputKeyboardType?: any;
    loading?: boolean;
  }>({ title: "", message: "" });

  const showAlert = (
    title: string,
    message: string,
    buttons?: ModalButton[],
    extraProps?: any,
  ) => {
    setAlertConfig({ title, message, buttons, ...extraProps });
    setAlertModalVisible(true);
  };
  //empty id means chores follow the main model
  const [quickFlowId, setQuickFlowIdState] = useState("");
  const maestroButterfly = useMaestroButterfly();
  const [ttsSpeed, setTtsSpeedState] = useState(() => Settings.getCached().ttsSpeed);
  const voicePackInstalled = useVoicePackInstalled();
  const [quickFlowOptions, setQuickFlowOptions] = useState<SelectorOption[]>(
    [],
  );
  const [whisperModel, setWhisperModelState] = useState("none");
  const [, setWhisperInstalled] = useState<boolean>(false);
  const [installedWhisperModels, setInstalledWhisperModels] = useState<
    Record<string, boolean>
  >({});
  const [isDownloadingWhisper, setIsDownloadingWhisper] = useState(false);
  const [whisperDownloadProgress, setWhisperDownloadProgress] = useState<{
    progress: number;
    etaSeconds: number;
    speedStr: string;
    sizeStr: string;
  } | null>(null);
  const [, setWhisperLanguageState] = useState(() => {
    try {
      return (
        Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0] || "auto"
      );
    } catch {
      return "auto";
    }
  });
  const notices = useSettingsNotices(visible);
  const report = useBugReport(showAlert);
  const [instruction, setInstructionState] = useState("");
  const [name, setNameState] = useState("");
  //only feeds the card's look, so it doesn't redesign on every keystroke
  const [confirmedName, setConfirmedName] = useState("");
  const [alwaysWhisper, setAlwaysWhisperState] = useState(false);
  const [autoSpeak, setAutoSpeakState] = useState(true);
  const [dreamIncognitoButton, setDreamIncognitoButtonState] = useState(true);
  const [dreamAntiBurnIn, setDreamAntiBurnInState] = useState(true);
  const [dreamWakeWord, setDreamWakeWordState] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetailsState] = useState(false);
  const [editAiMessages, setEditAiMessagesState] = useState(false);
  const [showDetectionBoxes, setShowDetectionBoxesState] = useState(false);
  const [advancedMode, setAdvancedModeState] = useState(false);
  const [useAppContext, setUseAppContextState] = useState(true);
  const [autoStartMic, setAutoStartMicState] = useState(true);
  const [shareInstanceUrl, setShareInstanceUrlState] = useState("");
  const [showRemoteImages, setShowRemoteImagesState] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  //plugin enabled states (tool name or widget id -> bool)
  const [pluginStates, setPluginStates] = useState<Record<string, boolean>>({});

  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  //mirrored from secret store for editing
  const [mcpHeaderValues, setMcpHeaderValues] = useState<
    Record<string, string>
  >({});
  const [mcpConnecting, setMcpConnecting] = useState<Record<string, boolean>>(
    {},
  );
  //shared draft for the add form
  const [serverDraft, setServerDraft] = useState({
    name: "",
    url: "",
    headerName: "",
    headerValue: "",
    clientId: "",
  });
  const [serverDraftBusy, setServerDraftBusy] = useState(false);
  //active detail server
  const [mcpDetailId, setMcpDetailId] = useState<string | null>(null);
  //triggers repaint on connection change
  const [mcpTick, setMcpTick] = useState(0);

  const allTools: ITool[] = ToolManager.getBuiltInTools();
  const generalTools = allTools.filter(
    (t) => !MOBILE_TOOL_NAMES.has(t.definition.function.name),
  );
  const mobileTools = allTools.filter((t) =>
    MOBILE_TOOL_NAMES.has(t.definition.function.name),
  );

  const [cloudProvider, setCloudProvider] = useState<string>("none");
  const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(
    null,
  );
  const [hasSyncPin, setHasSyncPin] = useState(false);
  const [hasCloudBackup, setHasCloudBackup] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const languageOptions = [
    { id: "en", label: "English" },
    { id: "fr", label: "Français" },
  ];

  const cloudStorageOptions = [
    { id: "none", label: t("settings.cloud.none") },
    ...CLOUD_PROVIDERS.map((def) => ({ id: def.id, label: def.label })),
    ...(hubSupported && pairedHub
      ? [{ id: HUB_SYNC_ID, label: t("settings.nav.hub.title") }]
      : []),
  ];
  //active cloud wins over the hub, a backup cloud does not
  const syncAccount =
    (cloudProvider === "none" || cloudBackupMode) && pairedHub && !hubSyncPaused
      ? HUB_SYNC_ID
      : cloudBackupMode
        ? "none"
        : cloudProvider;

  const ollamaKeepAliveOptions = [
    { id: "300", label: "5m" },
    { id: "900", label: "10m" },
    { id: "1800", label: "30m" },
    { id: "3600", label: "1h" },
    { id: "7200", label: "2h" },
    { id: "18000", label: "5h" },
    { id: "43200", label: "12h" },
    { id: "86400", label: "24h" },
    { id: "-1", label: "∞" },
  ];

  //first step must fit the system prompt
  const withContextFloor = (
    service: string,
    options: { id: string; label: string }[],
  ) => {
    const floor = contextFloorTokens(service, instruction);
    return [
      { id: String(floor), label: `${(floor / 1024).toFixed(1)}k` },
      ...options.filter((o) => Number(o.id) > floor),
    ];
  };

  const litertContextLengthOptions = withContextFloor("litert", [
    { id: "1024", label: "1k" },
    { id: "2048", label: "2k" },
    { id: "4096", label: "4k" },
    { id: "8192", label: "8k" },
  ]);

  const ollamaContextLengthOptions = withContextFloor("ollama", [
    { id: "8192", label: "8k" },
    { id: "16384", label: "16k" },
    { id: "32768", label: "32k" },
    { id: "65536", label: "64k" },
    { id: "131072", label: "128k" },
    { id: "262144", label: "256k" },
    { id: "524288", label: "512k" },
  ]);

  type PermissionState = "granted" | "denied" | "undetermined";
  const [permissionStatuses, setPermissionStatuses] = useState<
    Record<
      "microphone" | "camera" | "location" | "photos" | "contacts" | "calendar",
      PermissionState
    >
  >({
    microphone: "undetermined",
    camera: "undetermined",
    location: "undetermined",
    photos: "undetermined",
    contacts: "undetermined",
    calendar: "undetermined",
  });

  const refreshPermissionStatuses = useCallback(async () => {
    const [mic, camera, location, photos, contacts, calendar] =
      await Promise.all([
        ExpoSpeechRecognitionModule.getPermissionsAsync().catch(() => null),
        ImagePicker.getCameraPermissionsAsync().catch(() => null),
        Location.getForegroundPermissionsAsync().catch(() => null),
        MediaLibrary.getPermissionsAsync().catch(() => null),
        Contacts.getPermissionsAsync().catch(() => null),
        Calendar.getCalendarPermissions().catch(() => null),
      ]);
    setPermissionStatuses({
      microphone: (mic?.status as PermissionState) ?? "undetermined",
      camera: (camera?.status as PermissionState) ?? "undetermined",
      location: (location?.status as PermissionState) ?? "undetermined",
      photos: (photos?.status as PermissionState) ?? "undetermined",
      contacts: (contacts?.status as PermissionState) ?? "undetermined",
      calendar: (calendar?.status as PermissionState) ?? "undetermined",
    });
  }, []);

  //keep badges in sync after the user flips a permission in system settings
  useEffect(() => {
    if (
      !visible ||
      activeSubPage !== "confidentiality" ||
      Platform.OS === "web"
    )
      return;
    refreshPermissionStatuses();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermissionStatuses();
    });
    return () => sub.remove();
  }, [visible, activeSubPage, refreshPermissionStatuses]);

  //null means no assistant role here
  const [assistantStatus, setAssistantStatus] = useState<boolean | null>(null);

  const refreshAssistantStatus = useCallback(() => {
    isDefaultAssistant()
      .then(setAssistantStatus)
      .catch(() => {});
  }, []);

  //recheck after returning from system settings
  useEffect(() => {
    if (!visible || activeSubPage !== "assistantoverlay") return;
    refreshAssistantStatus();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAssistantStatus();
    });
    return () => sub.remove();
  }, [visible, activeSubPage, refreshAssistantStatus]);

  const renderPermissionBadge = (status: PermissionState) => (
    <View
      style={[
        styles.permissionBadge,
        status === "granted" && styles.permissionBadgeAllowed,
      ]}
    >
      <Text
        style={[
          styles.permissionBadgeText,
          status === "granted" && styles.permissionBadgeTextAllowed,
        ]}
      >
        {status === "granted"
          ? t("permissions.allowed")
          : status === "denied"
            ? t("permissions.denied")
            : t("permissions.undefined")}
      </Text>
    </View>
  );

  const handleExportData = () => {
    setExportSelection({ settings: true, conversations: true });
    setExportScopeVisible(true);
  };

  const runExport = async (
    includeSettings: boolean,
    includeConversations: boolean,
  ) => {
    setExportScopeVisible(false);
    try {
      const ok = await BackupService.exportData({
        includeSettings,
        includeConversations,
      });
      if (ok)
        showAlert(t("settings.data.export"), t("settings.data.exportSuccess"));
    } catch {
      showAlert(t("common.error"), t("settings.data.exportFailed"));
    }
  };

  const handleImportData = async () => {
    try {
      const result = await BackupService.importData();
      if (result.success) {
        onDataChanged?.();
        showAlert(
          t("settings.data.import"),
          result.warning ?? t("settings.data.importSuccess"),
        );
      }
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : t("settings.data.importFailed");
      showAlert(t("common.error"), message);
    }
  };

  const handleDeleteAllConversations = () => {
    showAlert(
      t("settings.data.deleteAll.title"),
      t("settings.data.deleteAll.message"),
      [
        {
          text: t("settings.data.deleteAll.confirm"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await BackupService.deleteAllConversations();
              onDataChanged?.();
              showAlert(t("common.done"), t("settings.data.deleteAll.success"));
            } catch {
              showAlert(t("common.error"), t("settings.data.deleteAll.failed"));
            }
          },
        },
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
      ],
    );
  };

  const handleDeleteWhisper = () => {
    if (whisperModel === "none") return;
    showAlert(
      t("settings.whisper.delete.title"),
      t("settings.whisper.delete.message", { model: whisperModel }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.delete"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            try {
              await WhisperSTT.deleteModel(whisperModel);
              setWhisperInstalled(false);
              setInstalledWhisperModels((prev) => ({
                ...prev,
                [whisperModel]: false,
              }));
            } catch (e) {
              console.error("Failed to delete whisper model", e);
            }
          },
        },
      ],
    );
  };

  const whisperModelOptions = [
    { id: "none", label: t("settings.whisper.none") },
    {
      id: "tiny",
      label: t("settings.whisper.tiny"),
      isDownload: !installedWhisperModels["tiny"],
      ...(installedWhisperModels["tiny"] && whisperModel === "tiny"
        ? {
            rightIcon: deleteIcon,
            rightIconTintColor: Colors.surface,
            onRightIconPress: handleDeleteWhisper,
          }
        : {}),
    },
    {
      id: "base",
      label: t("settings.whisper.base"),
      isDownload: !installedWhisperModels["base"],
      ...(installedWhisperModels["base"] && whisperModel === "base"
        ? {
            rightIcon: deleteIcon,
            rightIconTintColor: Colors.surface,
            onRightIconPress: handleDeleteWhisper,
          }
        : {}),
    },
    {
      id: "small",
      label: t("settings.whisper.small"),
      isDownload: !installedWhisperModels["small"],
      ...(installedWhisperModels["small"] && whisperModel === "small"
        ? {
            rightIcon: deleteIcon,
            rightIconTintColor: Colors.surface,
            onRightIconPress: handleDeleteWhisper,
          }
        : {}),
    },
  ];

  const getWhisperSize = (model: string) => {
    switch (model) {
      case "tiny":
        return "31 MB";
      case "base":
        return "57 MB";
      case "small":
        return "180 MB";
      default:
        return "";
    }
  };

  useEffect(() => {
    //mirrors stored settings into the page
    const showSettings = (s: AppSettings) => {
      setLanguageState(s.language || "en");
      setThemeState(s.theme);
      setAiServiceState(s.aiService);
      setOllamaUrlState(s.ollamaUrl);
      setOllamaServersState(getOllamaServers());
      setOpenAIServersState(getOpenAIServers());
      setEnabledProvidersState(getEnabledProviders());
      setQuickFlowIdState(
        s.quickFlowModel
          ? quickFlowOptionId(
              s.quickFlowService,
              s.quickFlowUrl,
              s.quickFlowModel,
            )
          : "",
      );
      setWhisperModelState(s.whisperModel);
      setWhisperLanguageState(s.whisperLanguage);
      setInstructionState(s.instruction);
      setNameState(s.name || "");
      setConfirmedName(s.name || "");
      setAlwaysWhisperState(s.alwaysWhisper);
      setAutoSpeakState(s.autoSpeak);
      setDreamIncognitoButtonState(s.dreamIncognitoButton);
      setDreamAntiBurnInState(s.dreamAntiBurnIn);
      setDreamWakeWordState(s.dreamWakeWord);
      setShowTechnicalDetailsState(s.showTechnicalDetails);
      setEditAiMessagesState(s.editAiMessages);
      setShowDetectionBoxesState(s.showDetectionBoxes);
      setAdvancedModeState(s.advancedMode);
      setUseAppContextState(s.useAppContext);
      setAutoStartMicState(s.autoStartMic);
      setModelFailoverState(s.modelFailover);
      setShareInstanceUrlState(s.shareInstanceUrl || "");
      setShowRemoteImagesState(s.showRemoteImages);
      setLitertForceLoadState(s.litertForceLoad);
      setLitertContextLengthState(String(s.litertContextLength));
    };
    //other devices change settings through sync
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsSynced, () =>
      showSettings(Settings.getCached()),
    );

    const loadSettings = async () => {
      try {
        await Settings.init();
        const s = await Settings.load();
        showSettings(s);
        //installed read is synchronous while rendering
        await hydrateLiteRTCatalog();
        setInstalledLitertModels(getInstalledLiteRTModels());
        //apply to services
        const tuning = getOllamaTuning(s.ollamaUrl);
        AIModule.configure(s.ollamaUrl, tuning.contextLength, tuning.keepAlive);
        AIModule.setMode(s.aiService);
        const localModeAvailable = await AIModule.isModeAvailable("local");
        setLocalAvailable(localModeAvailable);
        //preselect on-device provider if available and no explicit choice saved
        if (localModeAvailable && !(await Settings.has("aiService"))) {
          setAiServiceState("local");
          Settings.set("aiService", "local");
          AIModule.setMode("local");
        }
        WhisperSTT.setLanguage(s.whisperLanguage);
      } catch (e) {
        console.warn("Failed to load settings", e);
      }

      try {
        setSyncPrefs(await SyncPrefsStore.load());
        if (SamplerHub.isSupported()) {
          setPairedHub(await SamplerHub.getPairedHub());
          setHubSyncPaused(await HubSync.isPaused());
        }
        await CloudSync.init();
        setCloudProvider(CloudSync.getProviderName());
        setCloudBackupMode(CloudSync.isBackupMode());
        setHasSyncPin(CloudSync.hasPin());
        if (CloudSync.getProviderName() !== "none") {
          const ui = await CloudSync.getUserInfo();
          setCloudUserInfo(ui);
          const time = await CloudSync.getLastSyncTime();
          setLastSyncTime(time);
          const size = await CloudSync.getLastSyncSize();
          setLastSyncSize(size);
          setHasCloudBackup(await CloudSync.hasCloudBackup());
        }
      } catch (e) {
        console.warn("Failed to init CloudSync", e);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
    return () => sub.remove();
  }, []);

  //all reachable models, one row each
  useEffect(() => {
    if (activeSubPage !== "advanced") return;
    let cancelled = false;
    (async () => {
      const sources = buildSources(localAvailable);
      const rows: SelectorOption[] = [
        { id: "", label: t("settings.quickFlow.sameAsMain") },
      ];
      //query all sources in parallel
      const modelsBySource = await Promise.all(
        sources.map((source) =>
          AIModule.getModelsFor(source.service, source.url),
        ),
      );
      sources.forEach((source, i) => {
        for (const model of [...modelsBySource[i]].sort((a, b) =>
          a.localeCompare(b),
        )) {
          rows.push({
            id: quickFlowOptionId(source.service, source.url, model),
            //source only matters when multiple
            label: sources.length > 1 ? `${model} — ${source.label}` : model,
          });
        }
      });
      if (!cancelled) setQuickFlowOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSubPage, localAvailable, ollamaServers, enabledProviders, t]);

  //built-in facts, read on page open
  useEffect(() => {
    if (activeSubPage !== "litert" || !localAvailable) return;
    let cancelled = false;
    AIModule.getLocalModelSheet()
      .then((sheet) => {
        if (!cancelled) setLocalSheet(sheet);
      })
      .catch((e) => console.warn("Failed to load local model sheet", e));
    return () => {
      cancelled = true;
    };
  }, [activeSubPage, localAvailable]);

  //browsers need a user gesture
  const handleDownloadLocal = async (modelId: string) => {
    setLocalDownload({ progress: 0, sizeStr: "" });
    const reportProgress = throttleProgress(setLocalDownload);
    try {
      await AIModule.downloadFor(
        "local",
        undefined,
        modelId,
        (progress, _eta, _speed, sizeStr) =>
          reportProgress({ progress, sizeStr }),
      );
      setLocalSheet(await AIModule.getLocalModelSheet());
    } catch (e) {
      console.warn("Local model download failed", e);
      showAlert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setLocalDownload(null);
    }
  };

  const handleSelectQuickFlow = (id: string) => {
    setQuickFlowIdState(id);
    const { service, url, model } = parseQuickFlowOptionId(id);
    Settings.setMany({
      quickFlowService: service,
      quickFlowUrl: url,
      quickFlowModel: model,
    });
  };

  //load plugin states when settings tab opens
  useEffect(() => {
    if (
      activeSubPage !== "tools" &&
      mcpDetailId === null
    )
      return;
    const states: Record<string, boolean> = {};
    for (const tool of ToolManager.getAllTools()) {
      const name = tool.definition.function.name;
      states[`tool:${name}`] = PluginRegistry.isEnabled(
        "tool",
        name,
        tool.enabledByDefault ?? false,
      );
    }
    setPluginStates(states);
  }, [activeSubPage, mcpTick, mcpDetailId]);

  //sync list when connections change
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      AppEvents.mcpServersChanged,
      () => {
        setMcpServers([...McpService.getServers()]);
        setMcpTick((t) => t + 1);
      },
    );
    return () => sub.remove();
  }, []);

  //read from secret store on mount
  useEffect(() => {
    if (activeSubPage !== "mcpservers" && mcpDetailId === null) return;
    const servers = McpService.getServers();
    //avoid flash of missing headers
    Promise.all(
      servers.map(
        async (server) =>
          [server.id, await McpService.getHeaderValue(server.id)] as const,
      ),
    )
      .then((entries) => {
        setMcpServers([...servers]);
        setMcpHeaderValues(Object.fromEntries(entries));
      })
      .catch(() => setMcpServers([...servers]));
  }, [activeSubPage, mcpDetailId]);

  //local spinner while connecting
  const connectMcpServer = async (id: string) => {
    setMcpConnecting((prev) => ({ ...prev, [id]: true }));
    try {
      const server = [
        ...McpService.getServers(),
        ...McpService.getHubServers(),
      ].find((s) => s.id === id);
      //check if server needs oauth
      if (McpService.getStatus(id).state === "needs_auth")
        await McpService.authorize(id);
      else if (server?.url.trim()) await McpService.connect(id);
    } finally {
      setMcpConnecting((prev) => ({ ...prev, [id]: false }));
    }
  };

  //shared label for list and detail
  //use registry for accurate count
  const mcpEnabledCount = (id: string): number =>
    McpService.getTools(id).filter((tool) =>
      PluginRegistry.isEnabled(
        "tool",
        tool.definition.function.name,
        tool.enabledByDefault ?? false,
      ),
    ).length;

  const mcpStatusLabel = (id: string): string => {
    if (mcpConnecting[id]) return t("settings.mcp.connecting");
    const status = McpService.getStatus(id);
    if (status.state === "connected") {
      const total = status.toolCount;
      if (total === 0) return t("settings.mcp.noTools");
      const enabled = mcpEnabledCount(id);
      //skip count when all enabled
      if (enabled === total)
        return total === 1
          ? t("settings.mcp.oneTool")
          : t("settings.mcp.toolCount", { count: total });
      return t("settings.mcp.toolsEnabled", { enabled, total });
    }
    if (status.state === "needs_auth") return t("settings.mcp.signInRequired");
    if (status.state === "error") return t("settings.mcp.unreachable");
    return t("settings.mcp.notConnected");
  };

  //the sign-in state shows an icon instead of a label
  const mcpNeedsAuth = (id: string): boolean =>
    !mcpConnecting[id] && McpService.getStatus(id).state === "needs_auth";

  //the overlay carries the sign-in itself
  const showMcpAuthInfo = (id: string) =>
    showAlert(
      t("settings.mcp.signInRequired"),
      t("settings.mcp.signInInfo"),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.mcp.signIn"),
          onPress: () => {
            setAlertModalVisible(false);
            connectMcpServer(id);
          },
        },
      ],
      { messageAlign: "left" },
    );

  const refreshMcpHeaders = async () => {
    const entries = await Promise.all(
      McpService.getServers().map(
        async (server) =>
          [server.id, await McpService.getHeaderValue(server.id)] as const,
      ),
    );
    setMcpHeaderValues(Object.fromEntries(entries));
  };

  //server joins only once it answers
  const openMcpAddSheet = () => {
    setServerDraft({
      name: "",
      url: "",
      headerName: "",
      headerValue: "",
      clientId: "",
    });
    setServerDraftBusy(false);
    setMcpAddVisible(true);
  };

  const openOllamaAddSheet = () => {
    setServerDraft({
      name: "",
      url: "",
      headerName: "",
      headerValue: "",
      clientId: "",
    });
    setServerDraftBusy(false);
    setOllamaAddVisible(true);
  };

  const submitMcpDraft = async () => {
    const url = serverDraft.url.trim();
    if (mcpServers.some((s) => s.url.trim() === url)) {
      showAlert(t("settings.server.addFailed"), t("settings.server.duplicate"));
      return;
    }
    setServerDraftBusy(true);
    try {
      await McpService.addServer(serverDraft);
      setMcpServers([...McpService.getServers()]);
      await refreshMcpHeaders();
      setMcpAddVisible(false);
    } catch (e: any) {
      showAlert(
        t("settings.server.addFailed"),
        e?.message || t("settings.mcp.unreachable"),
        undefined,
        { messageAlign: "left" },
      );
    } finally {
      setServerDraftBusy(false);
    }
  };

  const submitOllamaDraft = async () => {
    const url = serverDraft.url.trim();
    if (ollamaServers.some((s) => s.url.trim() === url)) {
      showAlert(t("settings.server.addFailed"), t("settings.server.duplicate"));
      return;
    }
    setServerDraftBusy(true);
    try {
      if (!(await AIModule.isSourceAvailable("ollama", url))) {
        showAlert(
          t("settings.ollama.unreachableTitle"),
          t("settings.ollama.unreachableInfo"),
          undefined,
          { image: errorImage, messageAlign: "left" },
        );
        return;
      }
      saveOllamaServers([
        ...ollamaServers,
        { url, name: serverDraft.name.trim() },
      ]);
      //skip waiting for the next sweep
      setServerErrors((prev) => ({ ...prev, [url]: false }));
      setOllamaAddVisible(false);
    } finally {
      setServerDraftBusy(false);
    }
  };

  const openOpenAIAddSheet = () => {
    setServerDraft({
      name: "",
      url: "",
      headerName: "",
      headerValue: "",
      clientId: "",
    });
    setOpenAIKeyDraft("");
    setServerDraftBusy(false);
    setOpenAIAddVisible(true);
  };

  const submitOpenAIDraft = async () => {
    const url = serverDraft.url.trim();
    if (openaiServers.some((s) => s.url.trim() === url)) {
      showAlert(t("settings.server.addFailed"), t("settings.server.duplicate"));
      return;
    }
    setServerDraftBusy(true);
    try {
      //unsaved key probes with the draft
      if (!(await new OpenAIProvider(url, openaiKeyDraft).isAvailable())) {
        showAlert(
          t("settings.ollama.unreachableTitle"),
          t("settings.cloudapi.unreachableInfo"),
          undefined,
          { messageAlign: "left" },
        );
        return;
      }
      const id = newOpenAIServerId();
      await setOpenAIApiKey(id, openaiKeyDraft);
      saveOpenAIServers([
        ...openaiServers,
        { id, url, name: serverDraft.name.trim() },
      ]);
      //skip waiting for the next sweep
      setServerErrors((prev) => ({ ...prev, [url]: false }));
      setOpenAIAddVisible(false);
    } finally {
      setServerDraftBusy(false);
    }
  };

  const saveMcpServer = async (id: string, patch: Partial<McpServerConfig>) => {
    await McpService.updateServer(id, patch);
    setMcpServers([...McpService.getServers()]);
  };

  //empty link drops the server
  const handleMcpUrlBlur = async (id: string, url: string) => {
    if (!url.trim()) {
      await McpService.removeServer(id);
      setMcpServers([...McpService.getServers()]);
      setMcpDetailId(null);
      setActiveSubPage("mcpservers");
      return;
    }
    await saveMcpServer(id, { url });
  };

  const removeMcpServer = (id: string, label: string) => {
    showAlert(
      t("settings.mcp.remove.title"),
      t("settings.mcp.remove.message", { name: label }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            await McpService.removeServer(id);
            setMcpServers([...McpService.getServers()]);
            setActiveSubPage("mcpservers");
          },
        },
      ],
    );
  };

  //save helpers
  const setLanguage = (v: string) => {
    setLanguageState(v);
    Settings.set("language", v);
  };

  const setTheme = (v: string) => {
    setThemeState(v);
    //skips the db round trip lag
    setThemeMode(v as "system" | "light" | "dark");
    Settings.set("theme", v);
  };

  const setAiService = (v: string) => {
    setAiServiceState(v);
    Settings.set("aiService", v);
    AIModule.setMode(v);
  };

  //prefer the given name
  const ollamaServerLabel = (server: OllamaServer): string =>
    server.name.trim() ||
    server.url
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "") ||
    t("settings.ollama.newServer");

  const openAIServerLabel = (index: number): string =>
    openAIServerNames(openaiServers)[index] ||
    ollamaServerLabel(openaiServers[index]);

  //undefined falls back to global
  const serverContextLength = (server: OllamaServer) =>
    server.contextLength && server.contextLength > 0
      ? server.contextLength
      : Settings.getCached().ollamaContextLength;

  const serverKeepAlive = (server: OllamaServer) =>
    server.keepAlive ?? Settings.getCached().ollamaKeepAlive;

  //unknown until the first ping answers
  const ollamaStatusLabel = (server: OllamaServer): string => {
    const url = server.url.trim();
    if (!url) return t("settings.ollama.noLink");
    const failed = serverErrors[url];
    if (failed === undefined) return t("settings.ollama.checking");
    return failed
      ? t("settings.ollama.unreachable")
      : t("settings.ollama.connected");
  };

  //move url only while ollama active
  const saveOllamaServers = (servers: OllamaServer[]) => {
    setOllamaServersState(servers);
    Settings.set("ollamaUrls", serializeServers(servers));
    if (aiService !== "ollama") return;
    const filled = servers.filter((s) => s.url.trim().length > 0);
    const active =
      filled.find((s) => s.url.trim() === ollamaUrl.trim()) ?? filled[0];
    const activeUrl = active?.url.trim() ?? "";
    if (activeUrl === ollamaUrl) return;
    setOllamaUrlState(activeUrl);
    Settings.set("ollamaUrl", activeUrl);
    if (active)
      AIModule.configure(
        activeUrl,
        serverContextLength(active),
        serverKeepAlive(active),
      );
  };

  const patchOllamaServer = (index: number, patch: Partial<OllamaServer>) => {
    saveOllamaServers(
      ollamaServers.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  //tune only the active server
  const tuneOllamaServer = (index: number, patch: Partial<OllamaServer>) => {
    const next = ollamaServers.map((s, i) =>
      i === index ? { ...s, ...patch } : s,
    );
    saveOllamaServers(next);
    const server = next[index];
    if (server.url.trim() === ollamaUrl.trim()) {
      AIModule.configure(
        server.url.trim(),
        serverContextLength(server),
        serverKeepAlive(server),
      );
    }
  };

  const setOllamaServerContext = (index: number, v: string) => {
    const next = v.replace(/[^0-9]/g, "");
    setOllamaContextDraft(next);
    const parsed = parseInt(next, 10);
    tuneOllamaServer(index, {
      contextLength: isNaN(parsed) ? undefined : parsed,
    });
  };

  //leading minus keeps -1 typable
  const setOllamaServerKeepAlive = (index: number, v: string) => {
    const next = (v.startsWith("-") ? "-" : "") + v.replace(/[^0-9]/g, "");
    setOllamaKeepAliveDraft(next);
    const parsed = parseInt(next, 10);
    tuneOllamaServer(index, { keepAlive: isNaN(parsed) ? undefined : parsed });
  };

  const loadOllamaModels = async (url: string, service = "ollama") => {
    const target = url.trim();
    const request = ++ollamaModelsRequest.current;
    if (!target) {
      setOllamaModels([]);
      return;
    }
    setOllamaModelsLoading(true);
    try {
      const models = await AIModule.getModelsFor(service, target, true);
      if (ollamaModelsRequest.current === request) setOllamaModels(models);
    } catch {
      if (ollamaModelsRequest.current === request) setOllamaModels([]);
    } finally {
      if (ollamaModelsRequest.current === request)
        setOllamaModelsLoading(false);
    }
  };

  const openOllamaServer = (index: number) => {
    const server = ollamaServers[index];
    setOllamaDetailIndex(index);
    setOllamaContextDraft(
      server?.contextLength != null ? String(server.contextLength) : "",
    );
    setOllamaKeepAliveDraft(
      server?.keepAlive != null ? String(server.keepAlive) : "",
    );
    setOllamaModels([]);
    loadOllamaModels(server?.url ?? "");
  };

  const openHubServer = (server: OllamaServer) => {
    setHubDetailUrl(server.url);
    //the llama.cpp options ride the hub status
    if (server.url === LLAMA_SERVER_URL) refreshHub();
    setOllamaContextDraft(
      server.contextLength != null ? String(server.contextLength) : "",
    );
    setOllamaKeepAliveDraft(
      server.keepAlive != null ? String(server.keepAlive) : "",
    );
    setOllamaModels([]);
    loadOllamaModels(server.url, HUB_PROVIDER_ID);
  };

  //active server picks up new tuning
  const patchHubServerPrefs = async (
    url: string,
    patch: Partial<OllamaServer>,
  ) => {
    await patchHubServer(url, patch);
    setHubPrefsTick((tick) => tick + 1);
    const server = getHubServers().find((s) => s.url === url);
    if (server && url === ollamaUrl.trim()) {
      AIModule.configure(
        url,
        serverContextLength(server),
        serverKeepAlive(server),
      );
    }
  };

  const setHubServerContext = (url: string, v: string) => {
    const next = v.replace(/[^0-9]/g, "");
    setOllamaContextDraft(next);
    const parsed = parseInt(next, 10);
    patchHubServerPrefs(url, {
      contextLength: isNaN(parsed) ? undefined : parsed,
    });
  };

  //leading minus keeps -1 typable
  const setHubServerKeepAlive = (url: string, v: string) => {
    const next = (v.startsWith("-") ? "-" : "") + v.replace(/[^0-9]/g, "");
    setOllamaKeepAliveDraft(next);
    const parsed = parseInt(next, 10);
    patchHubServerPrefs(url, {
      keepAlive: isNaN(parsed) ? undefined : parsed,
    });
  };

  const removeOllamaServer = (index: number) => {
    const server = ollamaServers[index];
    showAlert(
      t("settings.ollama.remove.title"),
      t("settings.ollama.remove.message", { name: ollamaServerLabel(server) }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: () => {
            setAlertModalVisible(false);
            saveOllamaServers(ollamaServers.filter((_, i) => i !== index));
            setOllamaDetailIndex(null);
          },
        },
      ],
    );
  };

  //empty link drops the server
  const handleOllamaUrlBlur = (index: number) => {
    const url = ollamaServers[index]?.url.trim() ?? "";
    if (!url) {
      saveOllamaServers(ollamaServers.filter((_, i) => i !== index));
      setOllamaDetailIndex(null);
      return;
    }
    checkServers();
    loadOllamaModels(url);
  };

  const reconnectOllamaServer = async (index: number) => {
    await checkServers();
    await loadOllamaModels(ollamaServers[index]?.url ?? "");
  };

  //move url only while openai active
  const saveOpenAIServers = (servers: OllamaServer[]) => {
    setOpenAIServersState(servers);
    Settings.set("openaiUrls", serializeServers(servers));
    if (aiService !== OPENAI_PROVIDER_ID) return;
    const filled = servers.filter((s) => s.url.trim().length > 0);
    const active =
      filled.find((s) => s.url.trim() === ollamaUrl.trim()) ?? filled[0];
    const activeUrl = active?.url.trim() ?? "";
    if (activeUrl === ollamaUrl) return;
    setOllamaUrlState(activeUrl);
    Settings.set("ollamaUrl", activeUrl);
    AIModule.configure(activeUrl);
  };

  const patchOpenAIServer = (index: number, patch: Partial<OllamaServer>) => {
    saveOpenAIServers(
      openaiServers.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const loadOpenAIModels = async (url: string) => {
    const target = url.trim();
    const request = ++openaiModelsRequest.current;
    if (!target) {
      setOpenAIModels([]);
      return;
    }
    setOpenAIModelsLoading(true);
    try {
      const models = await AIModule.getModelsFor(
        OPENAI_PROVIDER_ID,
        target,
        true,
      );
      if (openaiModelsRequest.current === request) setOpenAIModels(models);
    } catch {
      if (openaiModelsRequest.current === request) setOpenAIModels([]);
    } finally {
      if (openaiModelsRequest.current === request)
        setOpenAIModelsLoading(false);
    }
  };

  const openOpenAIServer = (index: number) => {
    const server = openaiServers[index];
    setOpenAIDetailIndex(index);
    setOpenAIKeyDraft("");
    if (server?.id) getOpenAIApiKeyById(server.id).then(setOpenAIKeyDraft);
    setOpenAIModels([]);
    loadOpenAIModels(server?.url ?? "");
    setOpenAISearchQuery("");
    setOpenAIModelsSearchHandoff(false);
    showOpenAIModelsPage("server");
  };

  //empty link drops the server
  const handleOpenAIUrlBlur = (index: number) => {
    const server = openaiServers[index];
    const url = server?.url.trim() ?? "";
    if (!url) {
      if (server?.id) setOpenAIApiKey(server.id, "");
      saveOpenAIServers(openaiServers.filter((_, i) => i !== index));
      setOpenAIDetailIndex(null);
      return;
    }
    checkServers();
    loadOpenAIModels(url);
  };

  //providers cache the key so rebuild
  const handleOpenAIKeyBlur = async (index: number) => {
    const server = openaiServers[index];
    if (!server) return;
    //legacy entries get an id here
    const id = server.id ?? newOpenAIServerId();
    if (!server.id) patchOpenAIServer(index, { id });
    await setOpenAIApiKey(id, openaiKeyDraft);
    const url = server.url.trim();
    if (aiService === OPENAI_PROVIDER_ID && url === ollamaUrl.trim()) {
      AIModule.configure(url);
    }
    checkServers();
    loadOpenAIModels(url);
  };

  const reconnectOpenAIServer = async (index: number) => {
    await checkServers();
    await loadOpenAIModels(openaiServers[index]?.url ?? "");
  };

  const removeOpenAIServer = (index: number) => {
    const server = openaiServers[index];
    showAlert(
      t("settings.ollama.remove.title"),
      t("settings.ollama.remove.message", { name: openAIServerLabel(index) }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("common.remove"),
          style: "danger",
          onPress: () => {
            setAlertModalVisible(false);
            if (server.id) setOpenAIApiKey(server.id, "");
            saveOpenAIServers(openaiServers.filter((_, i) => i !== index));
            setOpenAIDetailIndex(null);
          },
        },
      ],
    );
  };

  const refreshLitertModels = useCallback(() => {
    setInstalledLitertModels(getInstalledLiteRTModels());
  }, []);

  const setLitertForceLoad = (v: boolean) => {
    setLitertForceLoadState(v);
    Settings.set("litertForceLoad", v);
  };

  const setLitertContextLength = (v: string) => {
    setLitertContextLengthState(v);
    const parsed = parseInt(v, 10);
    if (!isNaN(parsed)) Settings.set("litertContextLength", parsed);
  };

  const handleDownloadLitert = async (entry: CatalogEntry) => {
    setAddModelSheetVisible(false);
    setDownloadingLitert(entry.repoId);
    setLitertDownloadProgress(null);
    try {
      //progress arrives through the shared subscription below
      await downloadLiteRTModel(entry.repoId);
    } catch (e) {
      //failures alert, cancels do not
      if (!(e instanceof LiteRTDownloadCancelled)) {
        showAlert(
          t("common.error"),
          e instanceof Error ? e.message : String(e),
        );
      }
    } finally {
      setDownloadingLitert(null);
      setLitertDownloadProgress(null);
      setLitertDownloadVisible(false);
      refreshLitertModels();
    }
  };

  const handleCancelLitert = () => {
    if (downloadingLitert) cancelLiteRTDownload(downloadingLitert);
  };

  const confirmDownloadLitert = (entry: CatalogEntry) => {
    showAlert(
      t("settings.litert.downloadTitle", { name: entry.label }),
      t("settings.litert.downloadMessage", {
        name: entry.label,
        size: formatBytes(entry.sizeBytes),
      }),
      [
        {
          text: t("settings.litert.downloadAction"),
          style: "primary",
          onPress: () => {
            setAlertModalVisible(false);
            handleDownloadLitert(entry);
          },
        },
        {
          text: t("common.cancel"),
          style: "secondary",
          onPress: () => setAlertModalVisible(false),
        },
      ],
    );
  };

  const handleDeleteLitert = (model: LiteRTModelInfo) => {
    showAlert(
      t("settings.litert.deleteTitle", { name: model.label }),
      t("settings.litert.deleteMessage"),
      [
        {
          text: t("common.delete"),
          style: "danger",
          onPress: () => {
            setAlertModalVisible(false);
            try {
              deleteLiteRTModel(model.id);
            } catch (e) {
              console.warn("Could not delete the model:", e);
            }
            refreshLitertModels();
            setInstalledModel(null);
          },
        },
        {
          text: t("common.cancel"),
          style: "secondary",
          onPress: () => setAlertModalVisible(false),
        },
      ],
    );
  };

  const openAddModelSheet = async () => {
    setLitertPage("browse");
    setLitertDetail(null);
    setHfModelInput("");
    setLitertSearchHandoff(false);
    setLitertSearchResults([]);
    setAddModelSheetVisible(true);
    //cache paints, hub refreshes behind
    const cached = getCachedFamilies();
    setLitertFamilies(cached);
    setLitertBrowserFailed(false);
    setLitertBrowserLoading(cached.length === 0);
    try {
      setLitertFamilies(await fetchFamilies());
    } catch (e) {
      console.warn("Could not list the hugging face models:", e);
      setLitertBrowserFailed(cached.length === 0);
    } finally {
      setLitertBrowserLoading(false);
    }
  };

  //queries hit the hub, not families
  const runLitertSearch = useCallback(
    async (query: string, signal: AbortSignal) => {
      setLitertSearchFailed(false);
      setLitertSearchLoading(true);
      try {
        const results = await searchModels(query, signal);
        if (!signal.aborted) setLitertSearchResults(results);
      } catch (e) {
        console.warn("Could not search the hugging face models:", e);
        if (!signal.aborted) setLitertSearchFailed(true);
      } finally {
        if (!signal.aborted) setLitertSearchLoading(false);
      }
    },
    [],
  );

  //each page opens at the top
  const showLitertPage = (page: LitertPage) => {
    setAddModelScrolled(false);
    setLitertPage(page);
  };

  //a model found by search steps back to its results
  const openLitertSearch = () => {
    if (litertPage !== "model" || litertModelFrom !== "search") {
      setHfModelInput("");
      setLitertSearchResults([]);
      setLitertSearchLoading(false);
      setLitertSearchFailed(false);
    }
    setLitertSearchHandoff(true);
    showLitertPage("search");
  };

  //sizes resolve on open, not on listing
  const openLitertDetail = async (repoId: string) => {
    //keyboard slides away with the push
    Keyboard.dismiss();
    if (litertPage === "model") {
      //similar model swaps in place
      addModelScrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      setLitertModelFrom(litertPage);
    }
    showLitertPage("model");
    setLitertDetail({ repoId, entry: null, loading: true });
    fetchModelDescription(repoId).then((description) =>
      setLitertDetail((prev) =>
        prev?.repoId === repoId ? { ...prev, description } : prev,
      ),
    );
    const entry = await fetchCatalogEntry(repoId);
    setLitertDetail((prev) =>
      prev?.repoId === repoId ? { ...prev, entry, loading: false } : prev,
    );
  };

  const openInstalledLitert = (repoId: string) => {
    setInstalledModel({ id: repoId });
    fetchModelDescription(repoId).then((description) =>
      setInstalledModel((prev) =>
        prev?.id === repoId ? { ...prev, description } : prev,
      ),
    );
  };

  const litertFamilyName = (family: ModelFamily) =>
    family.id === OTHER_FAMILY_ID
      ? t("settings.litert.familyOther")
      : family.label;

  const setProviderEnabled = (ids: string | string[], enabled: boolean) => {
    const list = typeof ids === "string" ? [ids] : ids;
    const rest = enabledProviders.filter((p) => !list.includes(p));
    const next = enabled ? [...rest, ...list] : rest;
    setEnabledProvidersState(next);
    Settings.set("enabledProviders", serializeProviders(next));
    //the active service has to stay on an enabled provider
    if (!enabled && list.includes(aiService) && next.length > 0) {
      setAiService(next[0]);
    } else if (enabled && !enabledProviders.includes(aiService)) {
      setAiService(list[0]);
    }
  };

  //built-in models live under on-device
  const litertSupported = isProviderSupported("litert");
  const onDeviceProviders = [
    ...(litertSupported ? ["litert"] : []),
    ...(localAvailable ? ["local"] : []),
  ];

  //dead downloads resume from disk
  useEffect(() => {
    if (activeSubPage !== "litert" || downloadingLitert) return;
    let dropped = false;
    getPendingLiteRTDownload().then((pending) => {
      if (dropped || !pending) return;
      const entry = getCatalogEntry(pending);
      if (entry?.url) handleDownloadLitert(entry);
    });
    return () => {
      dropped = true;
    };
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubPage]);

  //typing settles before a round trip
  useEffect(() => {
    const query = hfModelInput.trim();
    if (!addModelSheetVisible || query.length < MIN_SEARCH_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => runLitertSearch(query, controller.signal),
      400,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hfModelInput, addModelSheetVisible, runLitertSearch]);

  //external downloads still drive this bar
  useEffect(() => {
    const reportProgress = throttleProgress(setLitertDownloadProgress);
    return subscribeLiteRTDownload((modelId, snapshot) => {
      if (snapshot) {
        setDownloadingLitert(modelId);
        reportProgress(snapshot);
      } else {
        setDownloadingLitert((current) =>
          current === modelId ? null : current,
        );
        setLitertDownloadProgress(null);
        setLitertDownloadVisible(false);
        refreshLitertModels();
      }
    });
  }, [refreshLitertModels]);

  const setWhisperModel = (v: string) => {
    setWhisperModelState(v);
    Settings.set("whisperModel", v);
    if (v && v !== "none") {
      WhisperSTT.isModelInstalled(v).then((installed) => {
        setWhisperInstalled(installed);
        setInstalledWhisperModels((prev) => ({ ...prev, [v]: installed }));
        if (installed) {
          WhisperSTT.init(v).then((success) => {
            if (!success) {
              showAlert(
                t("common.error"),
                t("settings.whisper.loadFailed", { model: v }),
              );
              setWhisperInstalled(false);
              setInstalledWhisperModels((prev) => ({ ...prev, [v]: false }));
            }
          });
        }
      });
    } else {
      setWhisperInstalled(false);
    }
  };

  const setInstruction = (v: string) => {
    setInstructionState(v);
    Settings.set("instruction", v);
  };

  const setName = (v: string) => {
    setNameState(v);
    Settings.set("name", v);
  };

  const setShareInstanceUrl = (v: string) => {
    setShareInstanceUrlState(v);
    Settings.set("shareInstanceUrl", v.trim());
  };

  const setAlwaysWhisper = (v: boolean) => {
    setAlwaysWhisperState(v);
    Settings.set("alwaysWhisper", v);
  };

  const setAutoSpeak = (v: boolean) => {
    setAutoSpeakState(v);
    Settings.set("autoSpeak", v);
  };

  const setDreamIncognitoButton = (v: boolean) => {
    setDreamIncognitoButtonState(v);
    Settings.set("dreamIncognitoButton", v);
  };

  const setDreamAntiBurnIn = (v: boolean) => {
    setDreamAntiBurnInState(v);
    Settings.set("dreamAntiBurnIn", v);
  };

  const setDreamWakeWord = async (v: boolean) => {
    setDreamWakeWordState(v);
    //dream cannot show the mic prompt
    if (v && !(await STT.requestPermissions())) {
      setDreamWakeWordState(false);
      return;
    }
    Settings.set("dreamWakeWord", v);
  };

  const setShowTechnicalDetails = (v: boolean) => {
    setShowTechnicalDetailsState(v);
    Settings.set("showTechnicalDetails", v);
  };

  const setEditAiMessages = (v: boolean) => {
    setEditAiMessagesState(v);
    Settings.set("editAiMessages", v);
  };

  const setShowDetectionBoxes = (v: boolean) => {
    setShowDetectionBoxesState(v);
    Settings.set("showDetectionBoxes", v);
  };

  const setAdvancedMode = (v: boolean) => {
    setAdvancedModeState(v);
    Settings.set("advancedMode", v);
  };

  const setModelFailover = (v: boolean) => {
    setModelFailoverState(v);
    Settings.set("modelFailover", v);
  };

  const setUseAppContext = (v: boolean) => {
    setUseAppContextState(v);
    Settings.set("useAppContext", v);
  };

  const setAutoStartMic = (v: boolean) => {
    setAutoStartMicState(v);
    Settings.set("autoStartMic", v);
  };

  const setShowRemoteImages = (v: boolean) => {
    setShowRemoteImagesState(v);
    Settings.set("showRemoteImages", v);
  };

  //same modal stays open between cloud steps
  const showCloudProgress = (
    message: string,
    providerName = CloudSync.getProviderName(),
  ) => {
    showAlert(
      getCloudProviderDefinition(providerName)?.label ??
        t("settings.cloud.storage"),
      message,
      undefined,
      { loading: true, messageAlign: "center" },
    );
  };

  const completeCloudConnect = async (v: string) => {
    const pinSet = CloudSync.hasPin();
    setHasSyncPin(pinSet);
    if (v !== "none") {
      const ui = await CloudSync.getUserInfo();
      setCloudUserInfo(ui);

      //paused account resumes with its stored pin
      if (pinSet) {
        showCloudProgress(t("cloudSync.syncing"));
        handleSyncNow();
        return;
      }

      //wait to avoid ui lag
      setTimeout(async () => {
        showCloudProgress(t("settings.cloud.progress.checking"));
        const cloudBackupExists = await CloudSync.hasCloudBackup();
        setHasCloudBackup(cloudBackupExists);
        if (cloudBackupExists) {
          handleUnlockSyncPin();
        } else {
          handleCreateSyncPin();
        }
      }, 100);
    } else {
      setCloudUserInfo(null);
      setHasSyncPin(false);
      setHasCloudBackup(false);
    }
  };

  const connectProvider = async (providerName: string) => {
    setCloudProvider(providerName);
    showCloudProgress(t("settings.cloud.progress.connecting"), providerName);
    const success = await CloudSync.setProvider(providerName);
    if (success) {
      if (pairedHub && !CloudSync.isBackupMode()) await pauseHubSync(true);
      await completeCloudConnect(providerName);
    } else {
      setCloudProvider("none");
      setCloudUserInfo(null);
      showAlert(
        t("settings.cloud.connectionError"),
        t("settings.cloud.connectFailed", {
          provider:
            getCloudProviderDefinition(providerName)?.label ?? providerName,
        }),
      );
    }
  };

  const pauseHubSync = async (paused: boolean) => {
    await HubSync.setPaused(paused);
    setHubSyncPaused(paused);
  };

  //cloud stays linked while paused
  const selectHubSync = async () => {
    if (CloudSync.getProviderName() !== "none" && !CloudSync.isBackupMode()) {
      setCloudProvider("none");
      await CloudSync.setProvider("none");
      await completeCloudConnect("none");
    }
    await pauseHubSync(false);
  };

  const handleSetCloudProvider = async (v: string) => {
    //a cloud sync account replaces the backup
    if (v !== HUB_SYNC_ID && CloudSync.isBackupMode()) {
      await CloudSync.setBackupMode(false);
      setCloudBackupMode(false);
    }
    if (v === HUB_SYNC_ID) {
      if (pairedHub) {
        await selectHubSync();
      }
      return;
    }

    if (v === "none") {
      setCloudProvider("none");
      if (pairedHub) await pauseHubSync(true);
      const success = await CloudSync.setProvider("none");
      if (success) {
        await completeCloudConnect("none");
      }
      return;
    }

    const def = getCloudProviderDefinition(v);
    if (!def) return;

    //setup happens in a sheet, current storage stays until it connects
    if (def.SetupComponent && !(await CloudSync.isProviderConfigured(v))) {
      setCloudSetupId(v);
      setCloudSetupVisible(true);
      return;
    }

    await connectProvider(v);
  };

  const setCloudBackup = async (on: boolean) => {
    if (on) {
      setCloudBackupPicking(true);
      return;
    }
    setCloudBackupPicking(false);
    setCloudProvider("none");
    await CloudSync.setProvider("none");
    await CloudSync.setBackupMode(false);
    setCloudBackupMode(false);
    await completeCloudConnect("none");
  };

  const pickBackupCloud = async (v: string) => {
    const def = getCloudProviderDefinition(v);
    if (!def) return;
    await CloudSync.setBackupMode(true);
    setCloudBackupMode(true);
    setCloudBackupPicking(false);
    if (def.SetupComponent && !(await CloudSync.isProviderConfigured(v))) {
      setCloudSetupId(v);
      setCloudSetupVisible(true);
      return;
    }
    await connectProvider(v);
  };

  const handleDisconnectCloud = () => {
    const label =
      getCloudProviderDefinition(cloudProvider)?.label ??
      t("settings.cloud.storage");
    showAlert(
      t("settings.cloud.disconnect.title", { name: label }),
      t("settings.cloud.disconnect.message"),
      [
        {
          text: t("cloudSync.disconnect"),
          style: "danger",
          onPress: async () => {
            setAlertModalVisible(false);
            //full unlink, the selector only pauses
            await CloudSync.disconnect();
            setCloudProvider("none");
            await completeCloudConnect("none");
            await refreshLastSync();
          },
        },
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
      ],
    );
  };

  const setSyncPref = async (key: keyof SyncPrefs, enabled: boolean) => {
    setSyncPrefs(await SyncPrefsStore.set(key, enabled));
    //changes made while off go up now
    if (!enabled) return;
    HubSync.request(0);
    CloudSync.requestAutoSync(0);
  };

  const handleCreateSyncPin = () => {
    let currentInput = "";
    showAlert(
      t("settings.pin.create.title"),
      t("settings.pin.create.message"),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.pin.create.confirm"),
          style: "primary",
          onPress: async () => {
            if (currentInput.length >= 4 && currentInput.length <= 6) {
              showCloudProgress(t("cloudSync.syncing"));
              await CloudSync.setPin(currentInput);
              setHasSyncPin(true);
              handleSyncNow();
            } else {
              setAlertModalVisible(false);
              setTimeout(
                () => showAlert(t("common.error"), t("settings.pin.invalid")),
                300,
              );
            }
          },
        },
      ],
      {
        showInput: true,
        inputPlaceholder: t("settings.pin.placeholder"),
        inputSecureTextEntry: true,
        inputKeyboardType: "numeric",
        onInputChange: (text: string) => {
          currentInput = text;
          setAlertConfig((prev) => ({ ...prev, inputValue: text }));
        },
      },
    );
  };

  const handleUnlockSyncPin = () => {
    let currentInput = "";
    showAlert(
      t("settings.pin.unlock.title"),
      t("settings.pin.unlock.message"),
      [
        {
          text: t("settings.pin.forgot"),
          onPress: handleForgetSyncPin,
          style: "secondary",
        },
        {
          text: t("settings.pin.unlock.confirm"),
          style: "primary",
          onPress: async () => {
            showCloudProgress(t("settings.cloud.progress.unlocking"));
            const success = await CloudSync.verifyAndSetPin(currentInput);
            if (success) {
              setHasSyncPin(true);
              //first sync runs right away
              showCloudProgress(t("cloudSync.syncing"));
              handleSyncNow();
            } else {
              showAlert(t("common.error"), t("settings.pin.incorrect"), [
                {
                  text: t("settings.pin.tryAgain"),
                  onPress: handleUnlockSyncPin,
                  style: "primary",
                },
                {
                  text: t("common.cancel"),
                  onPress: () => setAlertModalVisible(false),
                  style: "secondary",
                },
              ]);
            }
          },
        },
      ],
      {
        showInput: true,
        inputPlaceholder: t("settings.pin.placeholder"),
        inputSecureTextEntry: true,
        inputKeyboardType: "numeric",
        onInputChange: (text: string) => {
          currentInput = text;
          setAlertConfig((prev) => ({ ...prev, inputValue: text }));
        },
      },
    );
  };

  const handleForgetSyncPin = () => {
    showAlert(t("settings.pin.reset.title"), t("settings.pin.reset.message"), [
      {
        text: t("common.cancel"),
        onPress: () => setAlertModalVisible(false),
        style: "secondary",
      },
      {
        text: t("settings.pin.reset.confirm"),
        style: "danger",
        onPress: async () => {
          showCloudProgress(t("settings.cloud.progress.resetting"));
          await CloudSync.forgetCode();
          setHasSyncPin(false);
          handleCreateSyncPin();
        },
      },
    ]);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const result = await CloudSync.sync();
    setIsSyncing(false);
    if (result.success) {
      onDataChanged?.();
      await refreshLastSync();
      showAlert(t("common.success"), t("settings.cloud.syncSuccess"));
    } else {
      showAlert(
        t("settings.cloud.syncError"),
        result.error || t("settings.cloud.unknownError"),
      );
    }
  };

  const refreshLastSync = useCallback(async () => {
    const time = await CloudSync.getLastSyncTime();
    setLastSyncTime(time);
    const size = await CloudSync.getLastSyncSize();
    setLastSyncSize(size);
  }, []);

  useEffect(() => {
    if (visible) {
      CloudSync.requestAutoSync(DRAWER_SYNC_DELAY_MS);
      refreshLastSync();
    }
  }, [visible, refreshLastSync]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.syncCompleted, () => {
      refreshLastSync();
    });
    return () => sub.remove();
  }, [refreshLastSync]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      AppEvents.syncPinInvalidated,
      async () => {
        setHasSyncPin(false);
        setHasCloudBackup(await CloudSync.hasCloudBackup());
      },
    );
    return () => sub.remove();
  }, []);

  //ping every server of both providers
  const checkServers = useCallback(async () => {
    if (!settingsLoaded) return;
    const targets = [
      ...ollamaServers.map((s) => ({ service: "ollama", url: s.url.trim() })),
      ...openaiServers.map((s) => ({
        service: OPENAI_PROVIDER_ID,
        url: s.url.trim(),
      })),
    ].filter((target) => target.url.length > 0);
    const results = await Promise.all(
      targets.map((target) =>
        AIModule.isSourceAvailable(target.service, target.url),
      ),
    );
    const errors: Record<string, boolean> = {};
    targets.forEach((target, i) => {
      errors[target.url] = !results[i];
    });
    setServerErrors(errors);
  }, [settingsLoaded, ollamaServers, openaiServers]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        checkServers();
        if (Platform.OS === "web") {
          ["tiny", "base", "small"].forEach((m) => {
            WhisperSTT.isModelInstalled(m).then((installed) => {
              setInstalledWhisperModels((prev) => ({
                ...prev,
                [m]: installed,
              }));
            });
          });
          if (whisperModel && whisperModel !== "none") {
            WhisperSTT.isModelInstalled(whisperModel).then(setWhisperInstalled);
          }
        }
      }, 300);
    }
  }, [visible, checkServers, whisperModel]);

  const handleDownloadWhisper = async (modelToDownload?: string) => {
    const model = modelToDownload || whisperModel;
    if (model === "none") return;
    setIsDownloadingWhisper(true);
    setWhisperDownloadProgress(null);
    const reportProgress = throttleProgress(setWhisperDownloadProgress);
    try {
      await WhisperSTT.downloadModel(
        model,
        (progress, etaSeconds, speedStr, sizeStr) => {
          reportProgress({
            progress,
            etaSeconds,
            speedStr,
            sizeStr,
          });
        },
      );
      setWhisperInstalled(true);
      setInstalledWhisperModels((prev) => ({ ...prev, [model]: true }));
      setWhisperModel(model);
      showAlert(
        t("common.success"),
        t("settings.whisper.downloadSuccess", { model }),
      );
    } catch (e) {
      console.error("Failed to download whisper model", e);
      showAlert(t("common.error"), t("settings.whisper.downloadFailed"));
    } finally {
      setIsDownloadingWhisper(false);
      setWhisperDownloadProgress(null);
    }
  };

  const handleSelectWhisperModel = (v: string) => {
    if (v === "none" || installedWhisperModels[v]) {
      setWhisperModel(v);
      return;
    }
    showAlert(
      t("settings.whisper.download.title"),
      t("settings.whisper.download.message", {
        model: v,
        size: getWhisperSize(v),
      }),
      [
        {
          text: t("common.cancel"),
          onPress: () => setAlertModalVisible(false),
          style: "secondary",
        },
        {
          text: t("settings.whisper.download.confirm"),
          onPress: () => {
            setAlertModalVisible(false);
            handleDownloadWhisper(v);
          },
        },
      ],
    );
  };

  const largeScreenAnim = useAnimatedValue(visible ? 1 : 0);
  //closed overlay leaves the tree, a live page layer would still catch clicks on the web
  const [desktopMounted, setDesktopMounted] = useState(visible);
  if (visible && !desktopMounted) setDesktopMounted(true);
  const [navScrolled, setNavScrolled] = useState(false);
  const [desktopPageWidth, setDesktopPageWidth] = useState(0);
  const desktopPage = activeSubPage === "main" ? DESKTOP_ENTRY_PAGE : activeSubPage;
  const desktopSection = sectionOf(desktopPage);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, true);
      } else {
        settleDrawer(progress, true);
      }
    } else {
      //reset once the close settles
      const reset = () => {
        setActiveSubPage("main");
        setInstalledModel(null);
        setOllamaDetailIndex(null);
        setHubDetailUrl(null);
        setOpenAIDetailIndex(null);
      };
      if (isDesktop) {
        settleLayoutDrawer(largeScreenAnim, false, () => {
          reset();
          setDesktopMounted(false);
          setNavScrolled(false);
        });
      } else {
        settleDrawer(progress, false, undefined, undefined, reset);
      }
    }
  }, [visible, isDesktop, largeScreenAnim, progress]);

  //back header for subpages
  const renderSubPageHeader = (title: string) => (
    <View style={styles.header}>
      <View style={styles.headerSpacer} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  //shared card grid for list pages
  const renderCardGrid = (cards: GridCard[]) => (
    <CardGrid cards={cards} style={{ marginTop: Spacing.md }} />
  );

  //desktop nav keeps the open section highlighted
  const navItemStyle = (page: SubPage, last = false) =>
    pressStyle(
      [
        styles.navItem,
        last && styles.navItemLast,
        isDesktop && desktopSection === page && styles.navItemPressed,
      ],
      styles.navItemPressed,
    );

  //windowed nav lists the settings sections
  const renderSidebar = () => {
    const groups = [
      [
        { page: "profile", icon: profilIcon, label: name || t("settings.nav.profile.title") },
        { page: "cloud", icon: cloudIcon, label: t("settings.nav.cloud.title") },
        { page: "maestro", icon: operaIcon, label: t("settings.nav.maestro.title") },
      ],
      [
        { page: "general", icon: generalIcon, label: t("settings.nav.general.title") },
        { page: "service", icon: linkIcon, label: t("settings.nav.service.title") },
        { page: "tools", icon: toolIcon, label: t("settings.nav.tools.title") },
        { page: "advanced", icon: advancedIcon, label: t("settings.nav.advanced.title"), show: advancedMode },
      ],
      [
        { page: "confidentiality", icon: confidentialityIcon, label: t("settings.nav.privacy.title") },
        { page: "reports", icon: reportsIcon, label: t("settings.nav.support.title") },
        { page: "sociallinks", icon: informationIcon, label: t("settings.nav.info.title") },
      ],
    ];

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Spacing.lg, paddingBottom: 40 }}
      >
        {groups.map((items, index) => (
          <Group key={index} style={styles.sidebarActions}>
            {items
              .filter((item) => item.show !== false)
              .map((item) => (
                <ActionButton
                  key={item.page}
                  icon={item.icon}
                  iconBadge
                  label={item.label}
                  style={[
                    styles.sidebarButton,
                    desktopSection === item.page && styles.navItemPressed,
                  ]}
                  onPress={() => {
                    setActiveSubPage(item.page as SubPage);
                  }}
                />
              ))}
          </Group>
        ))}
      </ScrollView>
    );
  };

  //main navigation page content
  const renderMainPage = () => (
    <View style={styles.menuContainer}>
      {/* desktop keeps the row for its close button */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        {!isDesktop && (
          <Text style={styles.title} numberOfLines={1}>
            {t("settings.title")}
          </Text>
        )}
        <View style={styles.headerSpacer} />
      </View>

      {!!notices.update && (
        <NotificationBanner
          icon={downloadIcon}
          label={t("settings.notice.update", {
            version: notices.update.version,
          })}
          onPress={notices.openUpdate}
          style={[styles.groupSpacing, styles.mainPageGroup]}
        />
      )}

      {/* profile section */}
      <Group style={[styles.groupSpacing, styles.mainPageGroup]}>
        <Pressable
          style={navItemStyle("profile")}
          onPress={() => setActiveSubPage("profile")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={profilIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {name || t("settings.nav.profile.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.profile.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={navItemStyle("cloud")}
          onPress={() => setActiveSubPage("cloud")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={cloudIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>{t("settings.nav.cloud.title")}</Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.cloud.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={navItemStyle("maestro", true)}
          onPress={() => setActiveSubPage("maestro")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={operaIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.maestro.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {isDesktop
                ? t("settings.nav.maestro.subtitleDesktop")
                : t("settings.nav.maestro.subtitle")}
            </Text>
          </View>
        </Pressable>
      </Group>

      <Group style={[styles.groupSpacing, styles.mainPageGroup]}>
        <Pressable
          style={navItemStyle("general")}
          onPress={() => setActiveSubPage("general")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={generalIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.general.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.general.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={navItemStyle("service")}
          onPress={() => setActiveSubPage("service")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={linkIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.service.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.service.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={navItemStyle("tools", !advancedMode)}
          onPress={() => setActiveSubPage("tools")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={toolIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>{t("settings.nav.tools.title")}</Text>
            <Text style={styles.navSubtitle}>
              {isDesktop
                ? t("settings.nav.tools.subtitleDesktop")
                : t("settings.nav.tools.subtitle")}
            </Text>
          </View>
        </Pressable>

        {advancedMode && (
          <Pressable
            style={navItemStyle("advanced", true)}
            onPress={() => setActiveSubPage("advanced")}
          >
            <View style={styles.menuIconWrap}>
              <Image
                source={advancedIcon}
                style={styles.menuIcon}
                tintColor={Colors.textOnPrimary}
              />
            </View>
            <View style={styles.navTextContainer}>
              <Text style={styles.navTitle}>
                {t("settings.nav.advanced.title")}
              </Text>
              <Text style={styles.navSubtitle}>
                {t("settings.nav.advanced.subtitle")}
              </Text>
            </View>
          </Pressable>
        )}
      </Group>

      <Group style={[styles.groupSpacing, styles.mainPageGroup]}>
        <Pressable
          style={navItemStyle("confidentiality")}
          onPress={() => setActiveSubPage("confidentiality")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={confidentialityIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.privacy.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.privacy.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={navItemStyle("reports")}
          onPress={() => setActiveSubPage("reports")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={reportsIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>
              {t("settings.nav.support.title")}
            </Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.support.subtitle")}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={navItemStyle("sociallinks", true)}
          onPress={() => setActiveSubPage("sociallinks")}
        >
          <View style={styles.menuIconWrap}>
            <Image
              source={informationIcon}
              style={styles.menuIcon}
              tintColor={Colors.textOnPrimary}
            />
          </View>
          <View style={styles.navTextContainer}>
            <Text style={styles.navTitle}>{t("settings.nav.info.title")}</Text>
            <Text style={styles.navSubtitle}>
              {t("settings.nav.info.subtitle")}
            </Text>
          </View>
        </Pressable>
      </Group>
    </View>
  );

  // social links subpage content
  const renderSocialLinksSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.info.title"))}

      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <Text style={styles.settingLabel}>{t("settings.info.version")}</Text>
          <Text style={styles.helpText}>Opera Beta v{appVersion}</Text>
        </View>

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.info.links")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.info.linksHelp")}
          </Text>

          <Group>
            <ActionButton
              icon={operaIcon}
              label={t("settings.info.website")}
              onPress={() =>
                Linking.openURL("https://maestroai.company").catch(() => {})
              }
            />
            <ActionButton
              icon={githubIcon}
              label="Github"
              onPress={() =>
                Linking.openURL(
                  "https://github.com/MaestroAI-Company/opera",
                ).catch(() => {})
              }
            />
            <ActionButton
              icon={instagramIcon}
              label="Instagram"
              onPress={() =>
                Linking.openURL(
                  "https://www.instagram.com/maestroai.company?igsh=MWF4dmZvMXl1ZmdzeA==",
                ).catch(() => {})
              }
            />
            <ActionButton
              icon={tiktokIcon}
              label="TikTok"
              onPress={() =>
                Linking.openURL(
                  "https://www.tiktok.com/@maestroai.company?_r=1&_t=ZG-99DGujxTPEn",
                ).catch(() => {})
              }
            />
          </Group>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Text style={[styles.helpText, { textAlign: "center" }]}>
          Maestroai.Company
        </Text>
      </View>
    </View>
  );

  const exportProfileCard = async () => {
    let uri: string | null = null;
    try {
      uri = await captureRef(profileCardRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png" });
      }
    } catch (e) {
      console.warn("[Profile] card export failed:", e);
    } finally {
      //drop the cached png
      if (uri) releaseCapture(uri);
    }
  };

  // profile subpage
  const renderProfileSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.profile.title"))}

      {/* android needs a real view */}
      <View ref={profileCardRef} collapsable={false} style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <ProfileCard name={confirmedName} />
        </View>
      </View>

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Group>
            <ActionButton
              icon={penPlaceholderIcon}
              label={t("settings.profile.personalize")}
              onPress={() => setProfileEditVisible(true)}
            />
            {/* export ends in the mobile share sheet */}
            {!isDesktop && (
              <ActionButton
                icon={exportIcon}
                label={t("settings.profile.exportCard")}
                onPress={exportProfileCard}
              />
            )}
          </Group>
        </View>
      </View>
    </View>
  );

  // general subpage
  const renderGeneralSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.general.title"))}

      {/* language, appearance and modes card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, isDesktop && styles.toggleGroupRow]}>
          <Text style={[styles.settingLabel, isDesktop ? styles.toggleGroupContent : { marginBottom: Spacing.md }]}>
            {t("settings.general.language")}
          </Text>
          <Group style={isDesktop && styles.sliderGroup}>
            <Selector
              options={languageOptions}
              selectedValue={language}
              onSelect={setLanguage}
              title={t("settings.general.selectLanguage")}
              fullWidth
            />
          </Group>
        </View>

        <View style={[styles.settingRowVertical, isDesktop && styles.toggleGroupRow]}>
          {/* desktop puts the slider at the right of the label */}
          <Text style={[styles.settingLabel, isDesktop ? styles.toggleGroupContent : { marginBottom: Spacing.md }]}>
            {t("settings.general.theme")}
          </Text>
          <Group style={isDesktop && styles.sliderGroup}>
            <SliderToggle selectedValue={theme} onSelect={setTheme} />
          </Group>
        </View>

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.general.advancedMode")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.general.advancedModeHelp")}
              </Text>
            </View>
            <Toggle checked={advancedMode} onToggle={setAdvancedMode} />
          </View>
        </View>
      </View>

      {/* overlay and screen saver links */}
      {(!isDesktop || Platform.OS === "android") && (
        <Group style={styles.groupSpacing}>
          {!isDesktop &&
            renderToolsNavRow(
              "assistantoverlay",
              t("settings.nav.overlay.title"),
              t("settings.nav.overlay.subtitle"),
            )}
          {/* standby is an android dream service */}
          {Platform.OS === "android" &&
            renderToolsNavRow(
              "screensaver",
              t("settings.nav.screenSaver.title"),
              t("settings.nav.screenSaver.subtitle"),
            )}
        </Group>
      )}
    </View>
  );

  // screen saver subpage
  const renderScreenSaverSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.screenSaver.title"))}

      {/* screen saver settings card */}
      {Platform.OS === "android" && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>
              {t("settings.nav.screenSaver.title")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.screenSaver.help")}
            </Text>
            <Group>
              <ActionButton
                icon={advancedIcon}
                label={t("settings.screenSaver.open")}
                onPress={openScreenSaverSettings}
              />
            </Group>
          </View>
        </View>
      )}

      {/* anti burn-in and incognito card */}
      {Platform.OS === "android" && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.screenSaver.antiBurnIn")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.screenSaver.antiBurnInHelp")}
                </Text>
              </View>
              <Toggle
                checked={dreamAntiBurnIn}
                onToggle={setDreamAntiBurnIn}
              />
            </View>
            <View style={[styles.toggleGroupRow, { marginTop: Spacing.lg }]}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.screenSaver.incognito")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.screenSaver.incognitoHelp")}
                </Text>
              </View>
              <Toggle
                checked={dreamIncognitoButton}
                onToggle={setDreamIncognitoButton}
              />
            </View>
            <View style={[styles.toggleGroupRow, { marginTop: Spacing.lg }]}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.screenSaver.wakeWord")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.screenSaver.wakeWordHelp")}
                </Text>
              </View>
              <Toggle
                checked={dreamWakeWord}
                onToggle={setDreamWakeWord}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const renderAdvancedSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.advanced.title"))}

      {/* audio and technical card */}
      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.transcribeLocally.label")}
              </Text>
              <Text style={styles.helpText}>
                {Platform.OS === "web"
                  ? t("settings.transcribeLocally.helpWeb")
                  : t("settings.transcribeLocally.help")}
              </Text>
            </View>
            <Toggle checked={alwaysWhisper} onToggle={setAlwaysWhisper} />
          </View>
        </View>

        <View style={styles.settingRowVertical}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.general.technicalDetails")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.general.technicalDetailsHelp")}
              </Text>
            </View>
            <Toggle
              checked={showTechnicalDetails}
              onToggle={setShowTechnicalDetails}
            />
          </View>
        </View>

        <View style={styles.settingRowVertical}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.general.editAiMessages")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.general.editAiMessagesHelp")}
              </Text>
            </View>
            <Toggle
              checked={editAiMessages}
              onToggle={setEditAiMessages}
            />
          </View>
        </View>

        {Platform.OS === "android" && (
          <View style={styles.settingRowVertical}>
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.general.detectionBoxes")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.general.detectionBoxesHelp")}
                </Text>
              </View>
              <Toggle
                checked={showDetectionBoxes}
                onToggle={setShowDetectionBoxes}
              />
            </View>
          </View>
        )}

        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.litert.forceLoad")}
              </Text>
              <Text style={[styles.helpText, { marginBottom: 0 }]}>
                {t("settings.litert.forceLoadHelp")}
              </Text>
            </View>
            <Toggle checked={litertForceLoad} onToggle={setLitertForceLoad} />
          </View>
        </View>
      </View>

      {/* sharing instance card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.sharing.label")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.xs }]}>
            {t("settings.sharing.help")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.sharing.instanceHelp")}
          </Text>

          <Group>
            <TextInputField
              icon={serverIcon}
              placeholder="https://privatebin.net/"
              value={shareInstanceUrl}
              onChangeText={setShareInstanceUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Group>
        </View>
      </View>

      {/* quick flow card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }, isDesktop && styles.toggleGroupRow]}>
          <View style={isDesktop && styles.toggleGroupContent}>
            <Text style={styles.settingLabel}>
              {t("settings.quickFlow.label")}
            </Text>
            <Text style={[styles.helpText, !isDesktop && { marginBottom: Spacing.md }]}>
              {t("settings.quickFlow.help")}
            </Text>
          </View>
          <Group style={isDesktop && styles.sliderGroup}>
            <Selector
              options={quickFlowOptions}
              selectedValue={quickFlowId}
              onSelect={handleSelectQuickFlow}
              title={t("settings.quickFlow.select")}
              fullWidth
            />
          </Group>
        </View>
      </View>
    </View>
  );

  // maestro subpage
  const renderMaestroSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.maestro.title"))}

      <View style={{ paddingVertical: Spacing.xxl2, marginBottom: Spacing.xxl2 }}>
        <MaestroCard />
      </View>

      {/* butterfly selector card */}
      {voicePackInstalled && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.maestro.voice")}
            </Text>
            <IconSelector
              options={BUTTERFLY_OPTIONS}
              selectedValue={maestroButterfly}
              onSelect={selectButterfly}
            />
            {/* desktop puts the slider at the right of the label */}
            <View style={[{ marginTop: Spacing.xxl }, isDesktop && styles.toggleGroupRow]}>
              <Text style={[styles.settingLabel, isDesktop ? styles.toggleGroupContent : { marginBottom: Spacing.md }]}>
                {t("settings.tts.speed")}
              </Text>
              <Group style={isDesktop && styles.sliderGroup}>
                <Slider
                  icon={timeIcon}
                  options={TTS_SPEEDS.map((id) => ({ id, label: `${id}×` }))}
                  selectedValue={ttsSpeed}
                  onSelect={(v) => {
                    setTtsSpeedState(v);
                    Settings.set("ttsSpeed", v);
                  }}
                />
              </Group>
            </View>
          </View>
        </View>
      )}

      {/* voice engine card */}
      <VoiceEngineCard />

      {/* navigation to maestro subpages */}
      <Group style={styles.groupSpacing}>
        {renderToolsNavRow(
          "maestropreferences",
          t("settings.nav.maestroPreferences.title"),
          t("settings.nav.maestroPreferences.subtitle"),
        )}
      </Group>
    </View>
  );

  //maestro preferences subpage
  const renderMaestroPreferencesSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.maestroPreferences.title"))}

      {/* instructions card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("settings.profile.instructions")}
          </Text>
          <Group>
            <TextInputField
              icon={penPlaceholderIcon}
              placeholder={t("settings.profile.instructionsPlaceholder")}
              value={instruction}
              onChangeText={setInstruction}
            />
          </Group>
        </View>
      </View>

      {/* auto read card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.general.autoRead")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.general.autoReadHelp")}
              </Text>
            </View>
            <Toggle checked={autoSpeak} onToggle={setAutoSpeak} />
          </View>
        </View>
      </View>
    </View>
  );

  // assistant overlay subpage
  const renderAssistantOverlaySubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.overlay.title"))}

      {/* default assistant card */}
      {assistantStatus !== null && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>
              {t("settings.overlay.default")}
            </Text>
            <Text style={styles.helpText}>
              {t("settings.overlay.defaultHelp")}
            </Text>
            <Text
              style={[
                styles.assistantStatusText,
                assistantStatus
                  ? styles.assistantStatusOn
                  : styles.assistantStatusOff,
              ]}
            >
              {assistantStatus
                ? t("settings.overlay.isDefault")
                : t("settings.overlay.isNotDefault")}
            </Text>
            {!assistantStatus && (
              <Group>
                <ActionButton
                  icon={operaIcon}
                  label={t("settings.overlay.setDefault")}
                  onPress={openAssistantSettings}
                />
              </Group>
            )}
          </View>
        </View>
      )}

      {/* overlay options card */}
      <View style={styles.contentCard}>
        <View
          style={[
            styles.settingRowVertical,
            Platform.OS !== "android" && { marginBottom: 0 },
          ]}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.overlay.autoMic")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.overlay.autoMicHelp")}
              </Text>
            </View>
            <Toggle checked={autoStartMic} onToggle={setAutoStartMic} />
          </View>
        </View>

        {Platform.OS === "android" && (
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.overlay.appContext")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.overlay.appContextHelp")}
                </Text>
              </View>
              <Toggle checked={useAppContext} onToggle={setUseAppContext} />
            </View>
          </View>
        )}
      </View>
    </View>
  );

  // cloud subpage
  const renderCloudSubPage = () => {
    const cloudDef = getCloudProviderDefinition(cloudProvider);
    //details only once a backup went up
    const cloudRows =
      hasSyncPin && lastSyncTime
        ? [
            {
              label: cloudBackupMode ? t("cloudSync.lastBackup") : t("cloudSync.lastSynced"),
              value: new Date(lastSyncTime).toLocaleString(),
            },
            ...(lastSyncSize != null
              ? [
                  {
                    label: t("cloudSync.backupSize"),
                    value: formatBytes(lastSyncSize),
                  },
                ]
              : []),
          ]
        : [];
    const viaHub = syncAccount === HUB_SYNC_ID;
    //providers only travel through the hub
    const syncRows = [
      {
        key: "data",
        label: t("settings.hub.syncData"),
        help: t("settings.hub.syncDataHelp"),
        hubOnly: false,
      },
      {
        key: "settings",
        label: t("settings.hub.syncSettings"),
        help: viaHub
          ? t("settings.hub.syncSettingsHelp")
          : t("settings.hub.syncSettingsHelpCloud"),
        hubOnly: false,
      },
      {
        key: "providers",
        label: t("settings.hub.syncProviders"),
        help: viaHub
          ? t("settings.hub.syncProvidersHelp")
          : t("settings.hub.syncHubOnly"),
        hubOnly: true,
      },
    ] as const;

    //the linked cloud, for sync or backup
    const accountCard = cloudDef && cloudUserInfo && (
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.cloudAccount}>
            {cloudUserInfo.picture ? (
              <Image
                source={{ uri: cloudUserInfo.picture }}
                style={styles.cloudAvatar}
              />
            ) : (
              <View style={styles.cloudAvatar}>
                <Image
                  source={profilIcon}
                  style={styles.cloudAvatarIcon}
                  tintColor={Colors.textMuted}
                />
              </View>
            )}
            {!!cloudUserInfo.name && (
              <Text style={styles.cloudName} numberOfLines={1}>
                {cloudUserInfo.name}
              </Text>
            )}
            <Text style={styles.cloudEmail} numberOfLines={1}>
              {cloudUserInfo.email}
            </Text>
          </View>

          {cloudRows.length > 0 && (
            <Group style={[styles.infoGroup, styles.groupSpacingTight]}>
              {cloudRows.map((row) => (
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
          )}

          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {!hasSyncPin
              ? t("cloudSync.setupIncomplete")
              : cloudBackupMode
                ? t("cloudSync.backupReady")
                : t("cloudSync.ready")}
          </Text>

          {!hasSyncPin && (
            <Group
              style={[
                styles.highlightGroup,
                styles.groupSpacingTight,
                isSyncing && styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={hasCloudBackup ? cloudDownloadIcon : cloudUploadIcon}
                label={
                  hasCloudBackup
                    ? t("cloudSync.enterPin")
                    : t("cloudSync.createPin")
                }
                variant="highlight"
                disabled={isSyncing}
                onPress={
                  hasCloudBackup ? handleUnlockSyncPin : handleCreateSyncPin
                }
              />
            </Group>
          )}

          <Group>
            {hasSyncPin && (
              <ActionButton
                icon={reconnectIcon}
                label={
                  isSyncing
                    ? cloudBackupMode
                      ? t("cloudSync.backingUp")
                      : t("cloudSync.syncing")
                    : cloudBackupMode
                      ? t("cloudSync.backupNow")
                      : t("cloudSync.syncNow")
                }
                disabled={isSyncing}
                style={isSyncing && styles.highlightGroupDisabled}
                onPress={handleSyncNow}
              />
            )}
            <ActionButton
              icon={cancelIcon}
              label={t("cloudSync.disconnect")}
              onPress={handleDisconnectCloud}
            />
          </Group>
        </View>
      </View>
    );

    return (
      <View style={styles.subPageContainer}>
        {renderSubPageHeader(t("settings.nav.cloud.title"))}

        {/* sync account card */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }, isDesktop && styles.toggleGroupRow]}>
            <Text style={[styles.settingLabel, isDesktop ? styles.toggleGroupContent : { marginBottom: Spacing.md }]}>
              {t("settings.cloud.syncAccount")}
            </Text>
            <Group style={isDesktop && styles.sliderGroup}>
              <Selector
                options={cloudStorageOptions}
                selectedValue={syncAccount}
                onSelect={handleSetCloudProvider}
                title={t("settings.cloud.selectSyncAccount")}
                fullWidth
              />
            </Group>
          </View>
        </View>

        {!cloudBackupMode && accountCard}

        {/* sync choices card */}
        {syncAccount !== "none" && syncPrefs && (
          <View style={styles.contentCard}>
            {syncRows.map((row, index) => {
              const locked = row.hubOnly && !viaHub;
              return renderHubToggle(
                row.label,
                row.help,
                !locked && syncPrefs[row.key],
                (value) => setSyncPref(row.key, value),
                index === syncRows.length - 1,
                locked,
              );
            })}
          </View>
        )}

        {/* daily profile backup while sampler syncs */}
        {syncAccount === HUB_SYNC_ID && (
          <View style={styles.contentCard}>
            {renderHubToggle(
              t("settings.cloud.backup"),
              hubProfile ? t("settings.cloud.backupHelp") : t("settings.cloud.backupNeedsProfile"),
              cloudBackupMode && cloudProvider !== "none",
              setCloudBackup,
              !cloudBackupPicking,
              !hubProfile,
            )}
            {cloudBackupPicking && (
              <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
                  {t("settings.cloud.backupAccount")}
                </Text>
                <Group>
                  {CLOUD_PROVIDERS.map((def) => (
                    <ActionButton
                      key={def.id}
                      icon={cloudIcon}
                      label={def.label}
                      onPress={() => pickBackupCloud(def.id)}
                    />
                  ))}
                </Group>
              </View>
            )}
          </View>
        )}
        {cloudBackupMode && accountCard}
      </View>
    );
  };

  //one toggle row of the hub page
  const renderHubToggle = (
    label: string,
    help: string,
    checked: boolean,
    onToggle: (value: boolean) => void,
    last = false,
    disabled = false,
  ) => (
    <View
      key={label}
      style={[styles.settingRowVertical, last && { marginBottom: 0 }]}
    >
      <View style={styles.toggleGroupRow}>
        <View style={styles.toggleGroupContent}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.helpText}>{help}</Text>
        </View>
        <Toggle checked={checked} onToggle={onToggle} disabled={disabled} />
      </View>
    </View>
  );

  // service subpage content
  //the hub row shows once a provider is detected
  const showHubProvider =
    isProviderSupported(HUB_PROVIDER_ID) && getHubServers().length > 0;

  const renderServiceSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.service.title"))}

      {/* service providers group: beta, hugging face, ollama */}
      <Group style={styles.groupSpacing}>
        {!!BETA_SERVER_URL && (
          <Pressable
            style={pressStyle(
              styles.toggleGroupRowItem,
              styles.toggleGroupCardPressed,
            )}
            onPress={() => setActiveSubPage("beta")}
          >
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.service.beta")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.service.betaHelp")}
                </Text>
              </View>
              <View style={styles.toggleDivider} />
              <Toggle
                checked={enabledProviders.includes(BETA_PROVIDER_ID)}
                onToggle={(v) => setProviderEnabled(BETA_PROVIDER_ID, v)}
              />
            </View>
          </Pressable>
        )}

        {onDeviceProviders.length > 0 && (
          <Pressable
            style={pressStyle(
              styles.toggleGroupRowItem,
              styles.toggleGroupCardPressed,
            )}
            onPress={() => setActiveSubPage("litert")}
          >
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.service.litert")}
                </Text>
                <Text style={styles.helpText}>
                  {t(
                    litertSupported
                      ? "settings.service.litertHelp"
                      : "settings.service.localHelp",
                  )}
                </Text>
              </View>
              <View style={styles.toggleDivider} />
              <Toggle
                checked={onDeviceProviders.some((id) =>
                  enabledProviders.includes(id),
                )}
                onToggle={(v) => setProviderEnabled(onDeviceProviders, v)}
              />
            </View>
          </Pressable>
        )}

        <Pressable
          style={pressStyle(
            styles.toggleGroupRowItem,
            styles.toggleGroupCardPressed,
          )}
          onPress={() => setActiveSubPage("ollama")}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.ollama")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.ollamaHelp")}
              </Text>
            </View>
            <View style={styles.toggleDivider} />
            <Toggle
              checked={enabledProviders.includes("ollama")}
              onToggle={(v) => setProviderEnabled("ollama", v)}
            />
          </View>
        </Pressable>

        <Pressable
          style={pressStyle(
            [styles.toggleGroupRowItem, !showHubProvider && styles.navItemLast],
            styles.toggleGroupCardPressed,
          )}
          onPress={() => setActiveSubPage("openai")}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.cloudapi")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.cloudapiHelp")}
              </Text>
            </View>
            <View style={styles.toggleDivider} />
            <Toggle
              checked={enabledProviders.includes(OPENAI_PROVIDER_ID)}
              onToggle={(v) => setProviderEnabled(OPENAI_PROVIDER_ID, v)}
            />
          </View>
        </Pressable>

        {showHubProvider && (
          <Pressable
            style={pressStyle(
              [styles.toggleGroupRowItem, styles.navItemLast],
              styles.toggleGroupCardPressed,
            )}
            onPress={() => setActiveSubPage("hubprovider")}
          >
            <View style={styles.toggleGroupRow}>
              <View style={styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.service.hub")}
                </Text>
                <Text style={styles.helpText}>
                  {t("settings.service.hubHelp")}
                </Text>
              </View>
              <View style={styles.toggleDivider} />
              <Toggle
                checked={enabledProviders.includes(HUB_PROVIDER_ID)}
                onToggle={(v) => setProviderEnabled(HUB_PROVIDER_ID, v)}
              />
            </View>
          </Pressable>
        )}
      </Group>

      {/* local whisper transcription for web */}
      {Platform.OS === "web" && (
        <View style={styles.contentCard}>
          <View
            style={[styles.settingRowVertical, { zIndex: 9, marginBottom: 0 }]}
          >
            <View style={isDesktop && styles.toggleGroupRow}>
              <View style={isDesktop && styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.whisper.label")}
                </Text>
                <Text style={[styles.helpText, !isDesktop && { marginBottom: Spacing.md }]}>
                  {t("settings.whisper.help")}
                </Text>
              </View>
              <Group style={isDesktop && styles.sliderGroup}>
                <Selector
                  options={whisperModelOptions}
                  selectedValue={whisperModel}
                  onSelect={handleSelectWhisperModel}
                  title={t("settings.whisper.select")}
                  fullWidth
                />
              </Group>
            </View>
            {isDownloadingWhisper && (
              <DownloadProgress
                title={t("settings.whisper.downloading", {
                  model: whisperModel,
                })}
                progress={whisperDownloadProgress?.progress || 0}
                sizeStr={whisperDownloadProgress?.sizeStr}
                etaSeconds={whisperDownloadProgress?.etaSeconds}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );

  //servers the paired hub shares
  const renderHubProviderSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.service.hub"))}

      {/* hub servers card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.hubProvider.title")}
          </Text>
          <Text style={styles.helpText}>
            {t("settings.hubProvider.help", { name: getHubName() })}
          </Text>
          {renderCardGrid(
            getHubServers().map((server) => ({
              key: server.url,
              title: server.name,
              status: server.kind === "openai" ? "OpenAI" : "Ollama",
              onPress: () => openHubServer(server),
            })),
          )}
        </View>
      </View>
    </View>
  );

  //hub server drawer content like the ollama one
  const renderHubServerContent = (
    server: ReturnType<typeof getHubServers>[number],
  ) => {
    const url = server.url;

    return (
      <>

        {/* llama.cpp options, set in the sampler screen */}
        {url === LLAMA_SERVER_URL && hubStatus?.ctxSize != null && (
          <View style={styles.contentCard}>
            <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
              <Text style={styles.settingLabel}>{t("sampler.model.title")}</Text>
              <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
                {t("sampler.model.readOnly")}
              </Text>
              <Group style={styles.infoGroup}>
                {[
                  {
                    label: t("sampler.model.ctx"),
                    value: optionLabel(CTX_SIZE_OPTIONS, hubStatus.ctxSize),
                  },
                  {
                    label: t("sampler.model.keepAlive"),
                    value: optionLabel(KEEP_ALIVE_OPTIONS, hubStatus.keepAlive ?? 0),
                  },
                  {
                    label: t("sampler.model.parallel"),
                    value: optionLabel(PARALLEL_OPTIONS, hubStatus.parallel ?? 0),
                  },
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
          </View>
        )}

        {/* tuning card for ollama only */}
        {server.kind === "ollama" && (
          <View style={styles.contentCard}>
            <View style={[styles.settingRowVertical, isDesktop && styles.toggleGroupRow]}>
              {/* desktop puts the slider at the right of the text */}
              <View style={isDesktop && styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.ollama.contextLength")}
                </Text>
                <Text style={[styles.helpText, !isDesktop && { marginBottom: Spacing.md }]}>
                  {t("settings.ollama.contextHelp")}
                </Text>
              </View>
              <Group style={isDesktop && styles.sliderGroup}>
                {advancedMode ? (
                  <TextInputField
                    icon={messageIcon}
                    placeholder="8192"
                    value={ollamaContextDraft}
                    onChangeText={(v) => setHubServerContext(url, v)}
                    keyboardType="numeric"
                  />
                ) : (
                  <Slider
                    icon={messageIcon}
                    options={ollamaContextLengthOptions}
                    selectedValue={String(serverContextLength(server))}
                    onSelect={(v) => setHubServerContext(url, v)}
                  />
                )}
              </Group>
            </View>

            <View style={[styles.settingRowVertical, { marginBottom: 0 }, isDesktop && styles.toggleGroupRow]}>
              <View style={isDesktop && styles.toggleGroupContent}>
                <Text style={styles.settingLabel}>
                  {t("settings.ollama.keepAlive")}
                </Text>
                <Text style={[styles.helpText, !isDesktop && { marginBottom: Spacing.md }]}>
                  {advancedMode
                    ? t("settings.ollama.keepAliveHelpAdvanced")
                    : t("settings.ollama.keepAliveHelp")}
                </Text>
              </View>
              <Group style={isDesktop && styles.sliderGroup}>
                {advancedMode ? (
                  <TextInputField
                    icon={timeIcon}
                    placeholder="300"
                    value={ollamaKeepAliveDraft}
                    onChangeText={(v) => setHubServerKeepAlive(url, v)}
                    keyboardType="numeric"
                  />
                ) : (
                  <Slider
                    icon={timeIcon}
                    options={ollamaKeepAliveOptions}
                    selectedValue={String(serverKeepAlive(server))}
                    onSelect={(v) => setHubServerKeepAlive(url, v)}
                  />
                )}
              </Group>
            </View>
          </View>
        )}

        <ModelToggleList
          key={url}
          models={ollamaModels}
          loading={ollamaModelsLoading}
          service={HUB_PROVIDER_ID}
          url={url}
          disabled={server.disabledModels}
          capabilities={server.capabilities}
          onChange={(next) => patchHubServerPrefs(url, { disabledModels: next })}
          onCapabilitiesChange={(next) =>
            patchHubServerPrefs(url, { capabilities: next })
          }
        />

        {/* actions section */}
        {!ollamaModelsLoading && ollamaModels.length === 0 && (
          <View style={styles.contentCard}>
            <Group>
              <ActionButton
                icon={reconnectIcon}
                label={t("settings.ollama.reconnect")}
                onPress={() => loadOllamaModels(url, HUB_PROVIDER_ID)}
              />
            </Group>
          </View>
        )}
      </>
    );
  };

  //beta provider info subpage
  const renderBetaSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Opera Beta")}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.service.beta")}</Text>
          <Text style={[styles.helpText, { marginTop: Spacing.md }]}>
            {t("settings.beta.intro")}
          </Text>
          <Text style={[styles.helpText, { marginTop: Spacing.sm }]}>
            {t("settings.beta.privacy")}
          </Text>
          <Text style={[styles.helpText, { marginTop: Spacing.sm }]}>
            {t("settings.beta.testing")}
          </Text>
        </View>
      </View>
    </View>
  );

  //on-device provider, models the browser installed
  const renderLitertSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.litert.title"))}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.litert.modelTitle")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t(
              litertSupported ? "settings.litert.help" : "settings.local.help",
            )}
          </Text>

          {/* web has the built-in model only */}
          {litertSupported && (
            <Group
              style={[
                styles.highlightGroup,
                !!downloadingLitert && styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={addIcon}
                label={t("settings.litert.addModel")}
                variant="highlight"
                disabled={!!downloadingLitert}
                onPress={openAddModelSheet}
              />
            </Group>
          )}

          {(!!localSheet?.models.length ||
            installedLitertModels.length > 0 ||
            !!downloadingLitert) &&
            renderCardGrid([
              ...(localSheet?.models ?? []).map((model) => ({
                key: model.id,
                title: model.label,
                status: model.status
                  ? t(`settings.local.status.${model.status}`)
                  : "",
                onPress: () => setSelectedLocalModelId(model.id),
              })),
              ...(downloadingLitert
                ? [
                    {
                      key: downloadingLitert,
                      title: getLiteRTModelLabel(downloadingLitert),
                      status: t("settings.litert.downloadingPercent", {
                        percent: Math.round(
                          (litertDownloadProgress?.progress ?? 0) * 100,
                        ),
                      }),
                      onPress: () => setLitertDownloadVisible(true),
                    },
                  ]
                : []),
              ...installedLitertModels.map((model) => ({
                key: model.id,
                title: model.label,
                status: model.sizeStr,
                disabled: !!downloadingLitert,
                onPress: () => openInstalledLitert(model.id),
              })),
            ])}
        </View>
      </View>

      {litertSupported && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }, isDesktop && styles.toggleGroupRow]}>
            <View style={isDesktop && styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.litert.contextTitle")}
              </Text>
              <Text style={[styles.helpText, !isDesktop && { marginBottom: Spacing.md }]}>
                {t("settings.litert.contextHelp")}
              </Text>
            </View>
            <Group style={isDesktop && styles.sliderGroup}>
              <Slider
                icon={messageIcon}
                options={litertContextLengthOptions}
                selectedValue={litertContextLength}
                onSelect={setLitertContextLength}
              />
            </Group>
          </View>
        </View>
      )}
    </View>
  );


  //ollama server list subpage
  const renderOllamaSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader("Ollama")}

      {/* ollama servers card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.ollama.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.ollama.help")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              variant="highlight"
              onPress={openOllamaAddSheet}
            />
          </Group>

          {ollamaServers.length > 0 &&
            renderCardGrid(
              ollamaServers.map((server, index) => ({
                key: String(index),
                title: ollamaServerLabel(server),
                status: ollamaStatusLabel(server),
                error: serverErrors[server.url.trim()] === true,
                onPress: () => openOllamaServer(index),
              })),
            )}
        </View>
      </View>

      {/* model failover card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.failover")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.failoverHelp")}
              </Text>
            </View>
            <Toggle checked={modelFailover} onToggle={setModelFailover} />
          </View>
        </View>
      </View>
    </View>
  );

  //openai server list subpage
  const renderOpenAISubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.service.cloudapi"))}

      {/* openai servers card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.cloudapi.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.cloudapi.help")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              variant="highlight"
              onPress={openOpenAIAddSheet}
            />
          </Group>

          {openaiServers.length > 0 &&
            renderCardGrid(
              openaiServers.map((server, index) => ({
                key: String(index),
                title: openAIServerLabel(index),
                status: ollamaStatusLabel(server),
                error: serverErrors[server.url.trim()] === true,
                onPress: () => openOpenAIServer(index),
              })),
            )}
        </View>
      </View>

      {/* model failover card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.service.failover")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.service.failoverHelp")}
              </Text>
            </View>
            <Toggle checked={modelFailover} onToggle={setModelFailover} />
          </View>
        </View>
      </View>
    </View>
  );

  //each page opens at the top
  const showOpenAIModelsPage = (page: CloudModelsPage, model?: string) => {
    if (model) setOpenAIModelDetail(model);
    setOpenAIModelsScrolled(false);
    setOpenAIModelsPage(page);
  };

  const openOpenAIModelDetail = (model: string) => {
    Keyboard.dismiss();
    setOpenAIModelFrom(openaiModelsPage === "list" ? "list" : "server");
    showOpenAIModelsPage("model", model);
  };

  //search opens models sheet focused
  const openOpenAISearch = () => {
    setOpenAIModelsSearchHandoff(true);
    showOpenAIModelsPage("list");
  };

  const openaiModelsPageParent = (page: CloudModelsPage) =>
    page === "model" ? openaiModelFrom : page === "list" ? "server" : null;

  //android back steps up to the list before the sheet closes
  const handleOpenAIModelsBack = () => {
    const parent = openaiModelsPageParent(openaiModelsPage);
    if (parent === null) return false;
    //keyboard slides away with the pop
    Keyboard.dismiss();
    setOpenAIModelsSearchHandoff(false);
    showOpenAIModelsPage(parent);
    return true;
  };

  // confidentiality subpage content
  const renderConfidentialitySubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.privacy.title"))}

      {/* privacy policy card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.privacy.data")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.xs }]}>
            {t("settings.privacy.intro")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.xs }]}>
            {t("settings.privacy.externalServices")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.privacy.noTracking")}
          </Text>
          <Group>
            <ActionButton
              icon={hyperlinkIcon}
              label={t("settings.privacy.policy")}
              onPress={() =>
                Linking.openURL("https://maestroai.company/privacy").catch(
                  () => {},
                )
              }
            />
          </Group>
        </View>
      </View>

      {/* permissions card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("permissions.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {Platform.OS === "web"
              ? t("settings.privacy.permissionsWeb")
              : t("settings.privacy.permissionsNative")}
          </Text>

          <Group>
            <ActionButton
              icon={micIcon}
              label={t("permissions.microphone.label")}
              onPress={
                Platform.OS !== "web" ? () => Linking.openSettings() : undefined
              }
              disabled={Platform.OS === "web"}
              rightElement={
                Platform.OS !== "web"
                  ? renderPermissionBadge(permissionStatuses.microphone)
                  : undefined
              }
            />
            <ActionButton
              icon={cameraIcon}
              label={t("permissions.camera.label")}
              onPress={
                Platform.OS !== "web" ? () => Linking.openSettings() : undefined
              }
              disabled={Platform.OS === "web"}
              rightElement={
                Platform.OS !== "web"
                  ? renderPermissionBadge(permissionStatuses.camera)
                  : undefined
              }
            />
            <ActionButton
              icon={locationIcon}
              label={t("permissions.location.label")}
              onPress={
                Platform.OS !== "web" ? () => Linking.openSettings() : undefined
              }
              disabled={Platform.OS === "web"}
              rightElement={
                Platform.OS !== "web"
                  ? renderPermissionBadge(permissionStatuses.location)
                  : undefined
              }
            />
            {Platform.OS !== "web" && Platform.OS !== "android" && (
              <ActionButton
                icon={photoIcon}
                label={t("permissions.photos.label")}
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(permissionStatuses.photos)}
              />
            )}
            {Platform.OS !== "web" && (
              <ActionButton
                icon={profilIcon}
                label={t("permissions.contacts.label")}
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(
                  permissionStatuses.contacts,
                )}
              />
            )}
            {Platform.OS !== "web" && (
              <ActionButton
                icon={calendarIcon}
                label={t("permissions.calendar.label")}
                onPress={() => Linking.openSettings()}
                rightElement={renderPermissionBadge(
                  permissionStatuses.calendar,
                )}
              />
            )}
          </Group>
        </View>
      </View>

      <View style={styles.contentCard}>
        <View style={styles.settingRowVertical}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>
                {t("settings.privacy.remoteImages")}
              </Text>
              <Text style={styles.helpText}>
                {t("settings.privacy.remoteImagesHelp")}
              </Text>
            </View>
            <Toggle checked={showRemoteImages} onToggle={setShowRemoteImages} />
          </View>
        </View>
      </View>

      {/* data management card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.data.management")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.data.managementHelp")}
          </Text>

          <Group>
            <ActionButton
              icon={exportIcon}
              label={t("settings.data.exportAction")}
              onPress={handleExportData}
            />
            <ActionButton
              icon={downloadIcon}
              label={t("settings.data.importAction")}
              onPress={handleImportData}
            />
            <ActionButton
              icon={binIcon}
              label={t("settings.data.deleteAllAction")}
              onPress={handleDeleteAllConversations}
            />
          </Group>
        </View>
      </View>
    </View>
  );

  //fresh draft on every visit
  useEffect(() => {
    if (activeSubPage === "reports") report.reset();
  }, [activeSubPage]);

  // reports subpage content
  const renderReportsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.support.title"))}

      {/* bug report card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.support.report")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.support.reportHelp")}
          </Text>
          <Group style={styles.groupSpacingTight}>
            <TextInputField
              icon={penPlaceholderIcon}
              placeholder={t("bugReport.placeholder")}
              value={report.text}
              onChangeText={report.setText}
            />
          </Group>

          <View style={styles.toggleRow}>
            <Checkbox
              label={t("bugReport.attachLogs")}
              checked={report.logs !== null}
              onToggle={report.toggleLogs}
              labelFirst
              style={styles.checkboxRow}
            />
          </View>

          <Text
            style={[
              styles.helpText,
              { marginTop: Spacing.md, marginBottom: Spacing.md },
            ]}
          >
            {t("bugReport.consent")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={arrowIcon}
              label={t("bugReport.send")}
              onPress={() => report.send()}
              variant="highlight"
            />
          </Group>
        </View>
      </View>

      {/* contact support card */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("settings.support.more")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.support.moreHelp")}
          </Text>
          <Group>
            <ActionButton
              icon={supportIcon}
              label={t("settings.support.contact")}
              onPress={() =>
                Linking.openURL("https://maestroai.company/contact").catch(
                  () => {},
                )
              }
            />
          </Group>
        </View>
      </View>
    </View>
  );

  // tools subpage content: assistant and mobile tools stay inline, mcp links out
  //whole row opens the subpage
  const renderToolsNavRow = (page: SubPage, title: string, help: string) => (
    <Pressable
      style={pressStyle(
        styles.toggleGroupRowItem,
        styles.toggleGroupCardPressed,
      )}
      onPress={() => setActiveSubPage(page)}
    >
      <View style={styles.toggleGroupRow}>
        <View style={styles.toggleGroupContent}>
          <Text style={styles.settingLabel}>{title}</Text>
          <Text style={styles.helpText}>{help}</Text>
        </View>
        <Image
          source={rightArrowIcon}
          style={[styles.menuIcon, { marginRight: Spacing.md }]}
          tintColor={Colors.textMuted}
        />
      </View>
    </Pressable>
  );

  //toggle rows shared by the assistant and mobile tool cards
  const renderToolToggles = (list: ITool[]) =>
    list.map((tool, index) => {
      const name = tool.definition.function.name;
      const key = `tool:${name}`;
      const enabled = pluginStates[key] ?? tool.enabledByDefault ?? false;
      return (
        <View
          key={name}
          style={[
            styles.settingRowVertical,
            index === list.length - 1 && { marginBottom: 0 },
          ]}
        >
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>{tool.displayName ?? name}</Text>
              {tool.displayDescription ? (
                <Text style={styles.helpText}>
                  {shortDescription(tool.displayDescription)}
                </Text>
              ) : null}
            </View>
            <Toggle
              checked={enabled}
              onToggle={async (v) => {
                setPluginStates((prev) => ({ ...prev, [key]: v }));
                await PluginRegistry.setEnabled("tool", name, v);
                if (v) await tool.requestPermission?.();
              }}
            />
          </View>
        </View>
      );
    });

  const renderToolsSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.nav.tools.title"))}

      {/* mcp link on top */}
      <Group style={styles.groupSpacing}>
        {renderToolsNavRow(
          "mcpservers",
          t("settings.tools.mcp.title"),
          t("settings.tools.mcp.help"),
        )}
      </Group>

      {/* built-in tools card */}
      <View style={styles.contentCard}>
        {renderToolToggles(generalTools)}
      </View>

      {/* mobile actions card, phone only */}
      {!isDesktop && (
        <View style={styles.contentCard}>
          {renderToolToggles(mobileTools)}
        </View>
      )}
    </View>
  );

  //mcp list page
  const renderMcpServersSubPage = () => (
    <View style={styles.subPageContainer}>
      {renderSubPageHeader(t("settings.tools.mcp.title"))}

      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>
            {t("settings.tools.mcp.title")}
          </Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {t("settings.tools.mcp.help")}
          </Text>

          <Group style={styles.highlightGroup}>
            <ActionButton
              icon={addIcon}
              label={t("settings.server.add")}
              variant="highlight"
              onPress={openMcpAddSheet}
            />
          </Group>

          {(mcpServers.length > 0 || McpService.getHubServers().length > 0) &&
            renderCardGrid([
              ...mcpServers.map((server) => ({
                key: server.id,
                title: server.name,
                status: mcpStatusLabel(server.id),
                error: McpService.getStatus(server.id).state === "error",
                onPress: () => {
                  setMcpDetailId(server.id);
                },
              })),
              //hosted by the sampler
              ...McpService.getHubServers().map((server) => ({
                key: server.id,
                icon: samplerIcon,
                title: server.name,
                status: mcpStatusLabel(server.id),
                error: McpService.getStatus(server.id).state === "error",
                onPress: () => {
                  setMcpDetailId(server.id);
                },
              })),
            ])}
        </View>
      </View>
    </View>
  );

  const getSubPageContent = (page: SubPage) => {
    switch (page) {
      case "profile":
        return renderProfileSubPage();
      case "cloud":
        return renderCloudSubPage();
      case "hubprovider":
        return renderHubProviderSubPage();
      case "general":
        return renderGeneralSubPage();
      case "maestro":
        return renderMaestroSubPage();
      case "maestropreferences":
        return renderMaestroPreferencesSubPage();
      case "assistantoverlay":
        return renderAssistantOverlaySubPage();
      case "screensaver":
        return renderScreenSaverSubPage();
      case "service":
        return renderServiceSubPage();
      case "beta":
        return renderBetaSubPage();
      case "litert":
        return renderLitertSubPage();
      case "ollama":
        return renderOllamaSubPage();
      case "openai":
        return renderOpenAISubPage();
      case "confidentiality":
        return renderConfidentialitySubPage();
      case "advanced":
        return renderAdvancedSubPage();
      case "reports":
        return renderReportsSubPage();
      case "tools":
        return renderToolsSubPage();
      case "mcpservers":
        return renderMcpServersSubPage();
      case "sociallinks":
        return renderSocialLinksSubPage();
      case "main":
      default:
        return renderMainPage();
    }
  };

  const renderScrollPage = (page: SubPage, active: boolean) => (
    //focused field scrolls just above the keyboard
    <KeyboardAwareScrollView
      ref={active ? scrollRef : undefined}
      bottomOffset={Spacing.xl2}
      onScroll={active ? handleScroll : undefined}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingTop: isDesktop ? Spacing.xxl2 : 60,
        paddingBottom: 40,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flex: 1 }}>{getSubPageContent(page)}</View>
    </KeyboardAwareScrollView>
  );

  const innerContent = (
    <View style={styles.innerContainer}>
      <View
        style={[styles.fixedBackWrapper, { top: 60 }]}
        pointerEvents="box-none"
      >
        <DrawerBackButton
          kind={activeSubPage === "main" ? "close" : "back"}
          onPress={handleBack}
          scrolled={isScrolled}
          pulseKey={activeSubPage}
        />
      </View>

      <PageStack
        page={activeSubPage}
        visible={visible}
        //push travels the whole panel, padding included
        width={drawerWidth}
        parentOf={subPageParent}
        gestureEnabled={!sheetOpen}
        onBack={handleBack}
        renderPage={renderScrollPage}
      />

      <LinearGradient
        colors={[
          Colors.groupedBackground,
          Colors.groupedBackgroundFade,
          Colors.groupedBackgroundClear,
        ]}
        style={styles.gradientTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[
          Colors.groupedBackgroundClear,
          Colors.groupedBackgroundFade,
          Colors.groupedBackground,
        ]}
        style={styles.gradientBottom}
        pointerEvents="none"
      />
    </View>
  );

  const notificationModal = (
    <>
      <NotificationModal
        visible={alertModalVisible}
        title={alertConfig.title}
        icon={alertConfig.icon}
        image={alertConfig.image}
        message={alertConfig.message}
        messageAlign={alertConfig.messageAlign}
        onClose={() => setAlertModalVisible(false)}
        buttons={alertConfig.buttons}
        showInput={alertConfig.showInput}
        inputValue={alertConfig.inputValue}
        onInputChange={alertConfig.onInputChange}
        inputPlaceholder={alertConfig.inputPlaceholder}
        inputSecureTextEntry={alertConfig.inputSecureTextEntry}
        inputKeyboardType={alertConfig.inputKeyboardType}
        loading={alertConfig.loading}
      />
      <NotificationModal
        visible={exportScopeVisible}
        title={t("settings.data.exportAction")}
        message={t("settings.data.exportScope")}
        onClose={() => setExportScopeVisible(false)}
        options={[
          {
            label: t("settings.data.conversations"),
            checked: exportSelection.conversations,
            onToggle: (checked) =>
              setExportSelection((prev) => ({
                ...prev,
                conversations: checked,
              })),
          },
          {
            label: t("settings.title"),
            checked: exportSelection.settings,
            onToggle: (checked) =>
              setExportSelection((prev) => ({ ...prev, settings: checked })),
          },
        ]}
        buttons={[
          {
            text: t("settings.data.export"),
            style: "primary",
            disabled:
              !exportSelection.settings && !exportSelection.conversations,
            onPress: () =>
              runExport(
                exportSelection.settings,
                exportSelection.conversations,
              ),
          },
          {
            text: t("common.cancel"),
            style: "secondary",
            onPress: () => setExportScopeVisible(false),
          },
        ]}
      />
    </>
  );

  //the hub query waits for enough chars
  const isLitertQuerying = hfModelInput.trim().length >= MIN_SEARCH_LENGTH;

  const litertPageParent = (page: LitertPage) =>
    page === "model" ? litertModelFrom : page === "search" ? "browse" : null;

  //android back steps up the pages before the sheet closes
  const handleLitertBackPress = () => {
    const parent = litertPageParent(litertPage);
    if (parent === null) return false;
    //keyboard slides away with the pop
    Keyboard.dismiss();
    //a page reached by back never grabs focus
    setLitertSearchHandoff(false);
    showLitertPage(parent);
    return true;
  };

  const renderLitertCard = (repoId: string) => {
    const entry = getCatalogEntry(repoId);
    return (
      <Pressable
        key={repoId}
        onPress={() => openLitertDetail(repoId)}
        style={pressStyle(styles.litertCard, "fade")}
      >
        <View style={styles.litertCardTile}>
          <Image
            source={{ uri: modelAvatarUrl(entry, repoId) }}
            style={styles.litertTileImage}
          />
        </View>
        <Text style={styles.litertCardName} numberOfLines={2}>
          {entry?.label ?? repoId.split("/").pop()}
        </Text>
        <Text style={styles.litertCardMeta} numberOfLines={1}>
          {isLiteRTModelDownloaded(repoId)
            ? t("settings.litert.installed")
            : familyPublisher(entry?.family ?? "")}
        </Text>
      </Pressable>
    );
  };

  const renderLitertSearchResult = (entry: CatalogEntry) => (
    <Pressable
      key={entry.repoId}
      onPress={() => openLitertDetail(entry.repoId)}
      style={pressStyle(styles.litertSearchResultRow, "surface")}
    >
      <View style={styles.litertSearchResultTile}>
        <Image
          source={{ uri: modelAvatarUrl(entry, entry.repoId) }}
          style={styles.litertTileImage}
        />
      </View>
      <View style={styles.litertSearchResultInfo}>
        <Text style={styles.litertSearchResultName} numberOfLines={1}>
          {entry.label}
        </Text>
        <Text style={styles.litertRowMeta}>
          {isLiteRTModelDownloaded(entry.repoId)
            ? t("settings.litert.installed")
            : formatBytes(entry.sizeBytes)}
        </Text>
      </View>
    </Pressable>
  );

  const renderLitertDetail = () => {
    if (!litertDetail) return null;
    const { repoId, entry: resolved, loading, description } = litertDetail;
    const entry = resolved ?? getCatalogEntry(repoId);
    const installed = isLiteRTModelDownloaded(repoId);
    const canDownload = !!resolved && !installed && !downloadingLitert;
    const publisher = familyPublisher(entry?.family ?? "");
    const capabilities = (resolved?.capabilities ?? [])
      .filter((c): c is ModelCapabilityId =>
        LITERT_CAPABILITY_IDS.includes(c as ModelCapabilityId),
      )
      .map((c) => ({
        id: c,
        label: t(MODEL_CAPABILITY_KEYS[c]),
        icon: MODEL_CAPABILITY_ICONS[c],
      }));
    //both carousels share one card
    const sections = [
      {
        title: t("settings.litert.otherModels"),
        repoIds: similarModels(repoId),
      },
      {
        title: t("settings.litert.sameFamily"),
        repoIds: sameFamilyModels(repoId),
      },
    ].filter((section) => section.repoIds.length > 0);

    return (
      <>
        <View style={styles.contentCard}>
          <View style={styles.litertDetailHeader}>
            <View style={styles.litertDetailTile}>
              <Image
                source={{ uri: modelAvatarUrl(entry, repoId) }}
                style={styles.litertTileImage}
              />
            </View>
            <View style={styles.litertDetailInfo}>
              <Text style={styles.litertDetailName}>
                {entry?.label ?? repoId.split("/").pop()}
              </Text>
              {!!publisher && (
                <Text style={styles.litertDetailMeta}>{publisher}</Text>
              )}
              <Text style={styles.litertDetailMeta}>
                {loading
                  ? t("settings.litert.loading")
                  : resolved
                    ? formatBytes(resolved.sizeBytes)
                    : t("settings.litert.unavailable")}
              </Text>
              {capabilities.map((capability) => (
                <View key={capability.id} style={styles.litertCapability}>
                  <Image
                    source={capability.icon}
                    style={styles.litertCapabilityIcon}
                    tintColor={Colors.textSecondary}
                  />
                  <Text style={styles.litertDetailMeta}>
                    {capability.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Group
            style={[
              styles.highlightGroup,
              styles.litertDetailDownload,
              !canDownload && styles.highlightGroupDisabled,
            ]}
          >
            <ActionButton
              icon={downloadIcon}
              label={
                installed
                  ? t("settings.litert.installed")
                  : t("settings.litert.downloadAction")
              }
              variant="highlight"
              disabled={!canDownload}
              onPress={() => resolved && confirmDownloadLitert(resolved)}
            />
          </Group>

          <Text style={[styles.settingLabel, styles.litertDetailSection]}>
            {t("settings.litert.description")}
          </Text>
          <Text style={styles.helpText}>
            {description === undefined
              ? t("settings.litert.loading")
              : (description ?? t("settings.litert.noDescription"))}
          </Text>
        </View>

        {sections.length > 0 && (
          <View style={[styles.contentCard, styles.litertFamilies]}>
            {sections.map((section) => (
              <View key={section.title}>
                <Text style={[styles.settingLabel, styles.litertFamilyTitle]}>
                  {section.title}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.litertCarousel}
                >
                  {section.repoIds.map(renderLitertCard)}
                </ScrollView>
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  const litertList = litertBrowserLoading ? (
    <Text style={styles.helpText}>{t("settings.litert.loading")}</Text>
  ) : litertBrowserFailed ? (
    <Text style={styles.helpText}>{t("settings.litert.loadFailed")}</Text>
  ) : (
    <View style={styles.litertFamilies}>
      {litertFamilies.map((family) => (
        <View key={family.id}>
          <Text style={[styles.settingLabel, styles.litertFamilyTitle]}>
            {litertFamilyName(family)}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.litertCarousel}
          >
            {family.repoIds.map(renderLitertCard)}
          </ScrollView>
        </View>
      ))}
    </View>
  );

  //nothing until a query goes out
  const litertSearchList = litertSearchLoading ? (
    <Text style={styles.helpText}>{t("settings.litert.loading")}</Text>
  ) : litertSearchFailed ? (
    <Text style={styles.helpText}>{t("settings.litert.loadFailed")}</Text>
  ) : litertSearchResults.length > 0 ? (
    <Group>{litertSearchResults.map(renderLitertSearchResult)}</Group>
  ) : (
    isLitertQuerying && (
      <Text style={styles.helpText}>{t("settings.litert.noResults")}</Text>
    )
  );

  const renderLitertSearchField = (page: LitertPage) => (
    <Group>
      <TextInputField
        icon={searchIcon}
        placeholder={t("settings.litert.addModelPlaceholder")}
        //other pages only lead to the search page
        value={page === "search" ? hfModelInput : ""}
        onChangeText={setHfModelInput}
        onFocus={
          page === "search"
            ? () => setLitertSearchHandoff(false)
            : openLitertSearch
        }
        autoFocus={page === "search" && litertSearchHandoff}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Group>
  );

  //catalog, search and model push like settings pages
  const renderLitertPage = (page: LitertPage, active: boolean) => (
    <>
      <SheetScrollView
        ref={active ? addModelScrollRef : undefined}
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
        onScroll={
          active
            ? (e) => setAddModelScrolled(e.nativeEvent.contentOffset.y > 4)
            : undefined
        }
        scrollEventThrottle={16}
      >
        {page === "browse" ? (
          <View style={styles.contentCard}>
            <View style={styles.settingRowVertical}>
              {renderLitertSearchField(page)}
            </View>
            {litertList}
          </View>
        ) : (
          <>
            <View style={[styles.contentCard, styles.litertSearchWithBack]}>
              {renderLitertSearchField(page)}
            </View>
            {page === "model"
              ? renderLitertDetail()
              : litertSearchList && (
                  <View style={styles.contentCard}>{litertSearchList}</View>
                )}
          </>
        )}
      </SheetScrollView>

      {/* floats over the scroll like the settings back button */}
      {page !== "browse" && (
        <View style={styles.litertBackWrapper} pointerEvents="box-none">
          <DrawerBackButton
            kind="back"
            onPress={handleLitertBackPress}
            scrolled={addModelScrolled}
            pulseKey={page === "model" ? litertDetail?.repoId : page}
          />
        </View>
      )}
    </>
  );

  const addModelSheet = (
    <DrawerSheet
      visible={addModelSheetVisible}
      onClose={() => setAddModelSheetVisible(false)}
      onBackPress={handleLitertBackPress}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          //stacked pages cannot size the sheet
          height: sheetMaxHeight,
        },
      ]}
      //fills the settings window, stacked pages cannot size it
      desktopStyle={[styles.addModelSheetDesktop, { height: "100%" }]}
    >
      <SheetBody
        style={styles.litertSheetBody}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setLitertBodyWidth((prev) => (prev !== width ? width : prev));
        }}
      >
        <PageStack
          page={litertPage}
          visible={addModelSheetVisible}
          width={litertBodyWidth}
          parentOf={litertPageParent}
          onBack={handleLitertBackPress}
          renderPage={renderLitertPage}
        />
      </SheetBody>
    </DrawerSheet>
  );

  const ollamaAddServerSheet = (
    <DrawerSheet
      visible={ollamaAddVisible}
      onClose={() => setOllamaAddVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <SheetScrollView
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t("settings.server.name")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.server.nameHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={serverDraft.name}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, name: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={serverDraft.url}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, url: v }))
                }
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group
              style={[
                styles.highlightGroup,
                (serverDraftBusy || !serverDraft.url.trim()) &&
                  styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={addIcon}
                label={
                  serverDraftBusy
                    ? t("settings.server.checking")
                    : t("settings.server.add")
                }
                variant="highlight"
                disabled={serverDraftBusy || !serverDraft.url.trim()}
                onPress={submitOllamaDraft}
              />
            </Group>
          </View>
        </View>
      </SheetScrollView>
    </DrawerSheet>
  );

  const liveOllamaServer =
    ollamaDetailIndex !== null ? ollamaServers[ollamaDetailIndex] : undefined;
  //closing clears the index, the slide out keeps the last server
  const [shownOllama, setShownOllama] = useState<{
    index: number;
    server: OllamaServer;
  } | null>(null);
  if (
    ollamaDetailIndex !== null &&
    liveOllamaServer &&
    (shownOllama?.index !== ollamaDetailIndex ||
      shownOllama.server !== liveOllamaServer)
  ) {
    setShownOllama({ index: ollamaDetailIndex, server: liveOllamaServer });
  }
  const ollamaDetailServer = shownOllama?.server;
  const shownOllamaIndex = shownOllama?.index ?? null;
  const ollamaDetailUrl = ollamaDetailServer?.url.trim() ?? "";
  const ollamaDetailConnected =
    ollamaDetailUrl.length > 0 && serverErrors[ollamaDetailUrl] === false;

  //ollama server detail sheet
  const ollamaServerSheet = (
    <DrawerSheet
      visible={ollamaDetailIndex !== null && !!liveOllamaServer}
      onClose={() => setOllamaDetailIndex(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <SheetKeyboardAwareScrollView
        bottomOffset={Spacing.xl2}
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
          {ollamaDetailServer && shownOllamaIndex !== null && (
            <>
              <View style={styles.contentCard}>
                <View style={styles.settingRowVertical}>
                  <Text
                    style={[styles.settingLabel, { marginBottom: Spacing.md }]}
                  >
                    {t("settings.server.name")}
                  </Text>
                  <Group>
                    <TextInputField
                      icon={penPlaceholderIcon}
                      placeholder={t("settings.server.namePlaceholder")}
                      value={ollamaDetailServer.name}
                      onChangeText={(v) =>
                        patchOllamaServer(shownOllamaIndex, { name: v })
                      }
                    />
                  </Group>
                </View>

                <View style={styles.settingRowVertical}>
                  <Text
                    style={[styles.settingLabel, { marginBottom: Spacing.md }]}
                  >
                    {t("settings.server.link")}
                  </Text>
                  <Group>
                    <TextInputField
                      icon={linkIcon}
                      placeholder={t("settings.service.serverLink")}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      value={ollamaDetailServer.url}
                      onChangeText={(v) =>
                        patchOllamaServer(shownOllamaIndex, { url: v })
                      }
                      onBlur={() => handleOllamaUrlBlur(shownOllamaIndex)}
                      rightIcon={
                        serverErrors[ollamaDetailUrl] ? errorIcon : undefined
                      }
                      rightIconLabel={t("common.error")}
                      onRightIconPress={() =>
                        showAlert(
                          t("settings.ollama.unreachableTitle"),
                          t("settings.ollama.unreachableInfo"),
                          undefined,
                          { image: errorImage, messageAlign: "left" },
                        )
                      }
                    />
                  </Group>
                </View>

                <View
                  style={[
                    styles.settingRowVertical,
                    isDesktop && styles.toggleGroupRow,
                  ]}
                >
                  <View style={isDesktop && styles.toggleGroupContent}>
                    <Text style={styles.settingLabel}>
                      {t("settings.ollama.contextLength")}
                    </Text>
                    <Text
                      style={[
                        styles.helpText,
                        !isDesktop && { marginBottom: Spacing.md },
                      ]}
                    >
                      {t("settings.ollama.contextHelp")}
                    </Text>
                  </View>
                  <Group style={isDesktop && styles.sliderGroup}>
                    {advancedMode ? (
                      <TextInputField
                        icon={messageIcon}
                        placeholder="8192"
                        value={ollamaContextDraft}
                        onChangeText={(v) =>
                          setOllamaServerContext(shownOllamaIndex, v)
                        }
                        keyboardType="numeric"
                      />
                    ) : (
                      <Slider
                        icon={messageIcon}
                        options={ollamaContextLengthOptions}
                        selectedValue={String(
                          serverContextLength(ollamaDetailServer),
                        )}
                        onSelect={(v) =>
                          setOllamaServerContext(shownOllamaIndex, v)
                        }
                      />
                    )}
                  </Group>
                </View>

                <View
                  style={[
                    styles.settingRowVertical,
                    { marginBottom: 0 },
                    isDesktop && styles.toggleGroupRow,
                  ]}
                >
                  <View style={isDesktop && styles.toggleGroupContent}>
                    <Text style={styles.settingLabel}>
                      {t("settings.ollama.keepAlive")}
                    </Text>
                    <Text
                      style={[
                        styles.helpText,
                        !isDesktop && { marginBottom: Spacing.md },
                      ]}
                    >
                      {advancedMode
                        ? t("settings.ollama.keepAliveHelpAdvanced")
                        : t("settings.ollama.keepAliveHelp")}
                    </Text>
                  </View>
                  <Group style={isDesktop && styles.sliderGroup}>
                    {advancedMode ? (
                      <TextInputField
                        icon={timeIcon}
                        placeholder="300"
                        value={ollamaKeepAliveDraft}
                        onChangeText={(v) =>
                          setOllamaServerKeepAlive(shownOllamaIndex, v)
                        }
                        keyboardType="numeric"
                      />
                    ) : (
                      <Slider
                        icon={timeIcon}
                        options={ollamaKeepAliveOptions}
                        selectedValue={String(
                          serverKeepAlive(ollamaDetailServer),
                        )}
                        onSelect={(v) =>
                          setOllamaServerKeepAlive(shownOllamaIndex, v)
                        }
                      />
                    )}
                  </Group>
                </View>
              </View>

              <ModelToggleList
                key={ollamaDetailUrl}
                models={ollamaModels}
                loading={ollamaModelsLoading}
                service="ollama"
                url={ollamaDetailUrl}
                disabled={ollamaDetailServer.disabledModels}
                capabilities={ollamaDetailServer.capabilities}
                onChange={(next) =>
                  patchOllamaServer(shownOllamaIndex, { disabledModels: next })
                }
                onCapabilitiesChange={(next) =>
                  patchOllamaServer(shownOllamaIndex, { capabilities: next })
                }
                promptTiers={ollamaDetailServer.promptTiers}
                onPromptTiersChange={(next) =>
                  patchOllamaServer(shownOllamaIndex, { promptTiers: next })
                }
              />

              <View style={[styles.contentCard, { marginBottom: 0 }]}>
                <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                  <Group>
                    {!ollamaDetailConnected && (
                      <ActionButton
                        icon={reconnectIcon}
                        label={
                          ollamaModelsLoading
                            ? t("settings.ollama.connecting")
                            : t("settings.ollama.reconnect")
                        }
                        disabled={
                          ollamaModelsLoading || ollamaDetailUrl.length === 0
                        }
                        onPress={() => reconnectOllamaServer(shownOllamaIndex)}
                      />
                    )}
                    <ActionButton
                      icon={binIcon}
                      label={t("settings.ollama.remove.action")}
                      onPress={() => removeOllamaServer(shownOllamaIndex)}
                    />
                  </Group>
                </View>
              </View>
            </>
          )}
        </SheetKeyboardAwareScrollView>
    </DrawerSheet>
  );

  const shownHubServer = getHubServers().find((s) => s.url === shownHubUrl);

  //hub server detail sheet
  const hubServerSheet = (
    <DrawerSheet
      visible={hubDetailUrl !== null && !!shownHubServer}
      onClose={() => setHubDetailUrl(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <SheetKeyboardAwareScrollView
        bottomOffset={Spacing.xl2}
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {shownHubServer && renderHubServerContent(shownHubServer)}
      </SheetKeyboardAwareScrollView>
    </DrawerSheet>
  );

  const openaiModelsServer =
    openaiDetailIndex !== null ? openaiServers[openaiDetailIndex] : undefined;
  const openaiDetailUrl = openaiModelsServer?.url.trim() ?? "";
  const openaiDetailConnected =
    openaiDetailUrl.length > 0 && serverErrors[openaiDetailUrl] === false;

  const renderOpenAISearchField = (page: CloudModelsPage) => (
    <Group>
      <TextInputField
        icon={searchIcon}
        placeholder={t("settings.ollama.searchModels")}
        //only list page edits the search
        value={page === "list" ? openaiSearchQuery : ""}
        onChangeText={setOpenAISearchQuery}
        onFocus={
          page === "list"
            ? () => setOpenAIModelsSearchHandoff(false)
            : () => {
                setOpenAIModelsSearchHandoff(true);
                setOpenAISearchQuery("");
                showOpenAIModelsPage("list");
              }
        }
        autoFocus={page === "list" && openaiModelsSearchHandoff}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Group>
  );

  const renderOpenAIServerPage = (page: CloudModelsPage, active: boolean) => {
    const server = openaiModelsServer;
    const index = openaiDetailIndex;
    if (!server || index === null) return null;
    const url = server.url.trim();
    const disabled = server.disabledModels ?? NO_DISABLED_MODELS;
    const model = openaiModelDetail;

    return (
      <>
        {page === "server" ? (
          <SheetKeyboardAwareScrollView
            bottomOffset={Spacing.xl2}
            contentContainerStyle={styles.addModelSheetContent}
            keyboardShouldPersistTaps="handled"
            onScroll={
              active
                ? (e) =>
                    setOpenAIModelsScrolled(e.nativeEvent.contentOffset.y > 4)
                : undefined
            }
            scrollEventThrottle={16}
          >
            <View style={styles.contentCard}>
              <View style={styles.settingRowVertical}>
                <Text
                  style={[styles.settingLabel, { marginBottom: Spacing.md }]}
                >
                  {t("settings.server.name")}
                </Text>
                <Group>
                  <TextInputField
                    icon={penPlaceholderIcon}
                    placeholder={t("settings.server.namePlaceholder")}
                    value={server.name}
                    onChangeText={(v) =>
                      patchOpenAIServer(index, { name: v })
                    }
                  />
                </Group>
              </View>

              <View style={styles.settingRowVertical}>
                <Text
                  style={[styles.settingLabel, { marginBottom: Spacing.md }]}
                >
                  {t("settings.server.link")}
                </Text>
                <Group>
                  <TextInputField
                    icon={linkIcon}
                    placeholder={t("settings.service.serverLink")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    value={server.url}
                    onChangeText={(v) =>
                      patchOpenAIServer(index, { url: v })
                    }
                    onBlur={() => handleOpenAIUrlBlur(index)}
                    rightIcon={
                      serverErrors[url] ? errorIcon : undefined
                    }
                    rightIconLabel={t("common.error")}
                    onRightIconPress={() =>
                      showAlert(
                        t("settings.ollama.unreachableTitle"),
                        t("settings.cloudapi.unreachableInfo"),
                        undefined,
                        { messageAlign: "left" },
                      )
                    }
                  />
                </Group>
              </View>

              <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                <Text style={styles.settingLabel}>
                  {t("settings.cloudapi.apiKey")}
                </Text>
                <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
                  {t("settings.cloudapi.apiKeyHelp")}
                </Text>
                <Group>
                  <TextInputField
                    icon={keyIcon}
                    placeholder={t("settings.cloudapi.apiKeyPlaceholder")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    value={openaiKeyDraft}
                    onChangeText={setOpenAIKeyDraft}
                    onBlur={() => handleOpenAIKeyBlur(index)}
                  />
                </Group>
              </View>
            </View>

            <ModelToggleList
              key={url}
              models={openaiModels}
              loading={openaiModelsLoading}
              service={OPENAI_PROVIDER_ID}
              url={url}
              disabled={server.disabledModels}
              onChange={(next) =>
                patchOpenAIServer(index, { disabledModels: next })
              }
              onShowAll={(query) => {
                setOpenAISearchQuery(query);
                setOpenAIModelsSearchHandoff(false);
                showOpenAIModelsPage("list");
              }}
              onOpenModel={openOpenAIModelDetail}
              onOpenSearch={openOpenAISearch}
            />

            <View style={[styles.contentCard, { marginBottom: 0 }]}>
              <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                <Group>
                  {!openaiDetailConnected && (
                    <ActionButton
                      icon={reconnectIcon}
                      label={
                        openaiModelsLoading
                          ? t("settings.ollama.connecting")
                          : t("settings.ollama.reconnect")
                      }
                      disabled={
                        openaiModelsLoading || url.length === 0
                      }
                      onPress={() => reconnectOpenAIServer(index)}
                    />
                  )}
                  <ActionButton
                    icon={binIcon}
                    label={t("settings.ollama.remove.action")}
                    onPress={() => removeOpenAIServer(index)}
                  />
                </Group>
              </View>
            </View>
          </SheetKeyboardAwareScrollView>
        ) : (
          <SheetScrollView
            contentContainerStyle={styles.addModelSheetContent}
            keyboardShouldPersistTaps="handled"
            onScroll={
              active
                ? (e) =>
                    setOpenAIModelsScrolled(e.nativeEvent.contentOffset.y > 4)
                : undefined
            }
            scrollEventThrottle={16}
          >
            <View style={[styles.contentCard, styles.litertSearchWithBack]}>
              {renderOpenAISearchField(page)}
            </View>
            {page === "list" ? (
              <ModelToggleList
                key={url}
                models={openaiModels}
                loading={openaiModelsLoading}
                service={OPENAI_PROVIDER_ID}
                url={url}
                disabled={server.disabledModels}
                onChange={(next) =>
                  patchOpenAIServer(index, { disabledModels: next })
                }
                onOpenModel={openOpenAIModelDetail}
                showAll
                hideSearch
                searchQuery={openaiSearchQuery}
              />
            ) : (
              model && (
                <View style={styles.contentCard}>
                  <View style={styles.toggleGroupRow}>
                    <View
                      style={[styles.toggleGroupContent, styles.cloudModelText]}
                    >
                      <Text style={styles.litertDetailName}>{model}</Text>
                      <Text style={styles.litertDetailMeta}>
                        {openAIServerLabel(index)}
                      </Text>
                    </View>
                    <Toggle
                      checked={!disabled.includes(model)}
                      onToggle={(on) =>
                        patchOpenAIServer(index, {
                          disabledModels: on
                            ? disabled.filter((m) => m !== model)
                            : [...disabled, model],
                        })
                      }
                    />
                  </View>
                  <Text
                    style={[styles.settingLabel, styles.litertDetailSection]}
                  >
                    {t("settings.ollama.capabilities")}
                  </Text>
                  <ModelCapabilityToggles
                    key={model}
                    model={model}
                    service={OPENAI_PROVIDER_ID}
                    url={url}
                    onCapabilitiesChange={(m, caps) =>
                      patchOpenAIServer(index, {
                        capabilities: { ...server.capabilities, [m]: caps },
                      })
                    }
                    onPromptTierChange={(m, tier) => {
                      const { [m]: _removed, ...rest } = server.promptTiers ?? {};
                      patchOpenAIServer(index, {
                        promptTiers: tier ? { ...rest, [m]: tier } : rest,
                      });
                    }}
                    style={styles.cloudModelCapabilities}
                    labelStyle={styles.cloudModelCapabilityLabel}
                    checkboxes
                  />
                </View>
              )
            )}
          </SheetScrollView>
        )}

        {/* floats over the scroll like the settings back button */}
        {page !== "server" && (
          <View style={styles.litertBackWrapper} pointerEvents="box-none">
            <DrawerBackButton
              kind="back"
              onPress={handleOpenAIModelsBack}
              scrolled={openaiModelsScrolled}
              pulseKey={model ?? page}
            />
          </View>
        )}
      </>
    );
  };

  //openai server detail sheet
  const openaiServerSheet = (
    <DrawerSheet
      visible={openaiDetailIndex !== null && !!openaiModelsServer}
      onClose={() => setOpenAIDetailIndex(null)}
      onBackPress={handleOpenAIModelsBack}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          height: sheetMaxHeight,
        },
      ]}
      desktopStyle={[styles.addModelSheetDesktop, { height: "100%" }]}
    >
      <SheetBody
        style={styles.litertSheetBody}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setOpenAIModelsWidth((prev) => (prev !== width ? width : prev));
        }}
      >
        <PageStack
          page={openaiModelsPage}
          visible={openaiDetailIndex !== null && !!openaiModelsServer}
          width={openaiModelsWidth}
          parentOf={openaiModelsPageParent}
          onBack={handleOpenAIModelsBack}
          renderPage={renderOpenAIServerPage}
        />
      </SheetBody>
    </DrawerSheet>
  );

  const openaiAddServerSheet = (
    <DrawerSheet
      visible={openaiAddVisible}
      onClose={() => setOpenAIAddVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <SheetScrollView
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t("settings.server.name")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.server.nameHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={serverDraft.name}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, name: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={serverDraft.url}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, url: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>
              {t("settings.cloudapi.apiKey")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.cloudapi.apiKeyHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={keyIcon}
                placeholder={t("settings.cloudapi.apiKeyPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={openaiKeyDraft}
                onChangeText={setOpenAIKeyDraft}
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group
              style={[
                styles.highlightGroup,
                (serverDraftBusy || !serverDraft.url.trim()) &&
                  styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={addIcon}
                label={
                  serverDraftBusy
                    ? t("settings.server.checking")
                    : t("settings.server.add")
                }
                variant="highlight"
                disabled={serverDraftBusy || !serverDraft.url.trim()}
                onPress={submitOpenAIDraft}
              />
            </Group>
          </View>
        </View>
      </SheetScrollView>
    </DrawerSheet>
  );

  const mcpAddServerSheet = (
    <DrawerSheet
      visible={mcpAddVisible}
      onClose={() => setMcpAddVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {/* too tall to ride the keyboard */}
      <SheetKeyboardAwareScrollView
        bottomOffset={Spacing.xl2}
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t("settings.server.name")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.server.nameHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.server.namePlaceholder")}
                value={serverDraft.name}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, name: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.server.link")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                placeholder={t("settings.service.serverLink")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={serverDraft.url}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, url: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>
              {t("settings.mcp.headerLabel")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.mcp.headerHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.headerName")}
                autoCapitalize="none"
                autoCorrect={false}
                value={serverDraft.headerName}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, headerName: v }))
                }
              />
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.headerValue")}
                autoCapitalize="none"
                secureTextEntry
                value={serverDraft.headerValue}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, headerValue: v }))
                }
              />
            </Group>
          </View>

          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>
              {t("settings.mcp.clientIdLabel")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {t("settings.mcp.clientIdHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("settings.mcp.clientId")}
                autoCapitalize="none"
                autoCorrect={false}
                value={serverDraft.clientId}
                onChangeText={(v) =>
                  setServerDraft((prev) => ({ ...prev, clientId: v }))
                }
              />
            </Group>
          </View>

          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Group
              style={[
                styles.highlightGroup,
                (serverDraftBusy || !serverDraft.url.trim()) &&
                  styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={addIcon}
                label={
                  serverDraftBusy
                    ? t("settings.server.checking")
                    : t("settings.server.add")
                }
                variant="highlight"
                disabled={serverDraftBusy || !serverDraft.url.trim()}
                onPress={submitMcpDraft}
              />
            </Group>
          </View>
        </View>
      </SheetKeyboardAwareScrollView>
    </DrawerSheet>
  );

  const mcpServerDetail =
    mcpDetailId !== null
      ? (McpService.getHubServers().find((s) => s.id === mcpDetailId) ??
        mcpServers.find((s) => s.id === mcpDetailId))
      : undefined;
  const mcpServerHosted =
    mcpDetailId !== null
      ? McpService.getHubServers().some((s) => s.id === mcpDetailId)
      : false;

  const mcpDetailSheet = (
    <DrawerSheet
      visible={mcpDetailId !== null && !!mcpServerDetail}
      onClose={() => setMcpDetailId(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {mcpServerDetail && (() => {
        const server = mcpServerDetail;
        const hosted = mcpServerHosted;
        const status = McpService.getStatus(server.id);
        const tools = McpService.getTools(server.id);
        const busy = mcpConnecting[server.id];

        return (
          <SheetKeyboardAwareScrollView
            bottomOffset={Spacing.xl2}
            contentContainerStyle={styles.addModelSheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentCard}>
              <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                <Text style={styles.settingLabel}>{server.name}</Text>
                <Text
                  style={[
                    styles.helpText,
                    status.error ? { color: Colors.error } : undefined,
                  ]}
                >
                  {status.error ?? mcpStatusLabel(server.id)}
                </Text>
              </View>
            </View>

            {tools.length > 0 && (
              <View style={styles.contentCard}>
                <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                  <Text
                    style={[styles.settingLabel, { marginBottom: Spacing.md }]}
                  >
                    {t("settings.mcp.tools", { count: tools.length })}
                  </Text>
                  {tools.map((tool, index) => {
                    const name = tool.definition.function.name;
                    const key = `tool:${name}`;
                    const enabled =
                      pluginStates[key] ?? tool.enabledByDefault ?? false;
                    return (
                      <View
                        key={name}
                        style={
                          index < tools.length - 1 && {
                            marginBottom: Spacing.xxl,
                          }
                        }
                      >
                        <View style={styles.toggleGroupRow}>
                          <View style={styles.toggleGroupContent}>
                            <Text style={styles.settingLabel}>
                              {tool.displayName ?? name}
                            </Text>
                            {tool.displayDescription ? (
                              <Text style={styles.helpText}>
                                {shortDescription(tool.displayDescription)}
                              </Text>
                            ) : null}
                          </View>
                          <Toggle
                            checked={enabled}
                            onToggle={async (v) => {
                              setPluginStates((prev) => ({
                                ...prev,
                                [key]: v,
                              }));
                              await PluginRegistry.setEnabled("tool", name, v);
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {!hosted && (
              <View style={styles.contentCard}>
                <View style={styles.settingRowVertical}>
                  <Text
                    style={[styles.settingLabel, { marginBottom: Spacing.md }]}
                  >
                    {t("settings.server.link")}
                  </Text>
                  <Group>
                    <TextInputField
                      icon={linkIcon}
                      placeholder={t("settings.service.serverLink")}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      value={server.url}
                      onChangeText={(v) =>
                        setMcpServers((prev) =>
                          prev.map((s) =>
                            s.id === server.id ? { ...s, url: v } : s,
                          ),
                        )
                      }
                      onBlur={() => handleMcpUrlBlur(server.id, server.url)}
                      rightIcon={mcpNeedsAuth(server.id) ? infoIcon : undefined}
                      rightIconTint={Colors.textMuted}
                      rightIconLabel={t("common.info")}
                      onRightIconPress={() => showMcpAuthInfo(server.id)}
                    />
                  </Group>
                </View>

                <View style={styles.settingRowVertical}>
                  <Text style={styles.settingLabel}>
                    {t("settings.mcp.headerLabel")}
                  </Text>
                  <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
                    {t("settings.mcp.headerHelp")}
                  </Text>
                  <Group>
                    <TextInputField
                      icon={penPlaceholderIcon}
                      placeholder={t("settings.mcp.headerName")}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={server.headerName}
                      onChangeText={(v) =>
                        setMcpServers((prev) =>
                          prev.map((s) =>
                            s.id === server.id ? { ...s, headerName: v } : s,
                          ),
                        )
                      }
                      onBlur={() =>
                        saveMcpServer(server.id, {
                          headerName: server.headerName,
                        })
                      }
                    />
                    <TextInputField
                      icon={penPlaceholderIcon}
                      placeholder={t("settings.mcp.headerValue")}
                      autoCapitalize="none"
                      secureTextEntry
                      value={mcpHeaderValues[server.id] ?? ""}
                      onChangeText={(v) =>
                        setMcpHeaderValues((prev) => ({
                          ...prev,
                          [server.id]: v,
                        }))
                      }
                      onBlur={() =>
                        McpService.setHeaderValue(
                          server.id,
                          mcpHeaderValues[server.id] ?? "",
                        )
                      }
                    />
                  </Group>
                </View>

                <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                  <Text style={styles.settingLabel}>
                    {t("settings.mcp.clientIdLabel")}
                  </Text>
                  <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
                    {t("settings.mcp.clientIdHelp")}
                  </Text>
                  <Group>
                    <TextInputField
                      icon={penPlaceholderIcon}
                      placeholder={t("settings.mcp.clientId")}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={server.clientId ?? ""}
                      onChangeText={(v) =>
                        setMcpServers((prev) =>
                          prev.map((s) =>
                            s.id === server.id ? { ...s, clientId: v } : s,
                          ),
                        )
                      }
                      onBlur={() =>
                        saveMcpServer(server.id, {
                          clientId: server.clientId ?? "",
                        })
                      }
                    />
                  </Group>
                </View>
              </View>
            )}

            {(!hosted || status.state !== "connected") && (
              <View style={[styles.contentCard, { marginBottom: 0 }]}>
                <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                  <Group>
                    {//reconnect only while offline
                    status.state !== "connected" && (
                      <ActionButton
                        icon={reconnectIcon}
                        label={
                          busy
                            ? t("settings.mcp.connecting")
                            : t("settings.mcp.reconnect")
                        }
                        disabled={busy || !server.url.trim()}
                        onPress={() => connectMcpServer(server.id)}
                      />
                    )}
                    {!hosted && (
                      <ActionButton
                        icon={binIcon}
                        label={t("settings.mcp.remove.action")}
                        onPress={() => removeMcpServer(server.id, server.name)}
                      />
                    )}
                  </Group>
                </View>
              </View>
            )}
          </SheetKeyboardAwareScrollView>
        );
      })()}
    </DrawerSheet>
  );

  //storage switches only once the setup connects
  const CloudSetup = getCloudProviderDefinition(cloudSetupId)?.SetupComponent;

  const cloudSetupSheet = (
    <DrawerSheet
      visible={cloudSetupVisible}
      onClose={() => setCloudSetupVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <SheetScrollView
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          {CloudSetup && (
            <CloudSetup
              onDone={() => {
                setCloudSetupVisible(false);
                connectProvider(cloudSetupId);
              }}
            />
          )}
        </View>
      </SheetScrollView>
    </DrawerSheet>
  );

  //built-in model detail sheet
  const localModelDetailSheet = (
    <DrawerSheet
      visible={selectedLocalModel !== null}
      onClose={() => setSelectedLocalModelId(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {selectedLocalModel && (
        <SheetBody style={styles.addModelSheetBody}>
          <SheetScrollView
            contentContainerStyle={styles.addModelSheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentCard}>
              <Group style={styles.infoGroup}>
                <ActionButton
                  label={selectedLocalModel.label}
                  rightElement={
                    selectedLocalModel.status && (
                      <Text
                        style={styles.localModelFactValue}
                        numberOfLines={1}
                      >
                        {t(`settings.local.status.${selectedLocalModel.status}`)}
                      </Text>
                    )
                  }
                />
                {(
                  [
                    ["family", localSheet?.family],
                    ["runtime", localSheet?.runtime],
                    ["browser", localSheet?.browser],
                    ["version", selectedLocalModel.version],
                    [
                      "context",
                      selectedLocalModel.contextTokens !== undefined
                        ? t("settings.local.sheet.tokens", {
                            count:
                              selectedLocalModel.contextTokens.toLocaleString(),
                          })
                        : undefined,
                    ],
                    [
                      "thinking",
                      selectedLocalModel.thinking !== undefined
                        ? t(
                            selectedLocalModel.thinking
                              ? "settings.local.sheet.yes"
                              : "settings.local.sheet.no",
                          )
                        : undefined,
                    ],
                  ] as const
                )
                  .filter(([, value]) => !!value)
                  .map(([key, value]) => (
                    <ActionButton
                      key={key}
                      label={t(`settings.local.sheet.${key}`)}
                      rightElement={
                        <Text
                          style={styles.localModelFactValue}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {value}
                        </Text>
                      }
                    />
                  ))}
              </Group>

              {localSheet?.canDownload &&
                (selectedLocalModel.status === "downloadable" ||
                  selectedLocalModel.status === "downloading") && (
                  <Group
                    style={[
                      styles.highlightGroup,
                      styles.litertDetailDownload,
                      !!localDownload && styles.highlightGroupDisabled,
                    ]}
                  >
                    <ActionButton
                      icon={downloadIcon}
                      label={t("settings.local.download")}
                      variant="highlight"
                      disabled={!!localDownload}
                      onPress={() => {
                        handleDownloadLocal(selectedLocalModel.id);
                      }}
                    />
                  </Group>
                )}

              {!!localDownload && (
                <DownloadProgress
                  title={t("settings.local.downloading")}
                  progress={localDownload.progress}
                  sizeStr={localDownload.sizeStr}
                />
              )}
            </View>
          </SheetScrollView>
        </SheetBody>
      )}
    </DrawerSheet>
  );

  //on-device download detail sheet
  const litertDownloadSheet = (
    <DrawerSheet
      visible={litertDownloadVisible}
      onClose={() => setLitertDownloadVisible(false)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {!!downloadingLitert && (
        <SheetBody style={styles.addModelSheetBody}>
          <SheetScrollView contentContainerStyle={styles.addModelSheetContent}>
            <View style={styles.contentCard}>
              <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                <Text
                  style={[styles.settingLabel, { marginBottom: Spacing.md }]}
                >
                  {t("settings.litert.downloadingModel", {
                    name: getLiteRTModelLabel(downloadingLitert),
                  })}
                </Text>

                <Group style={styles.groupSpacingTight}>
                  <ProgressBar
                    progress={litertDownloadProgress?.progress ?? 0}
                    icon={downloadIcon}
                  />
                  <ActionButton
                    label={t("settings.litert.downloaded")}
                    rightElement={
                      <Text style={styles.litertRowMeta}>
                        {litertDownloadProgress?.sizeStr ??
                          t("download.starting")}
                      </Text>
                    }
                  />
                  <ActionButton
                    label={t("settings.litert.speed")}
                    rightElement={
                      <Text style={styles.litertRowMeta}>
                        {litertDownloadProgress?.speedStr ??
                          t("download.starting")}
                      </Text>
                    }
                  />
                  <ActionButton
                    label={t("settings.litert.timeLeft")}
                    rightElement={
                      <Text style={styles.litertRowMeta}>
                        {litertDownloadProgress?.etaSeconds
                          ? `${Math.round(litertDownloadProgress.etaSeconds)}s`
                          : t("download.starting")}
                      </Text>
                    }
                  />
                </Group>

                <Group>
                  <ActionButton
                    icon={cancelIcon}
                    label={t("settings.litert.cancelDownload")}
                    onPress={handleCancelLitert}
                  />
                </Group>
              </View>
            </View>
          </SheetScrollView>
        </SheetBody>
      )}
    </DrawerSheet>
  );

  const installedEntry = installedModel
    ? getCatalogEntry(installedModel.id)
    : null;
  const installedPublisher = installedEntry
    ? familyPublisher(installedEntry.family)
    : "";
  const installedCapabilities = (installedEntry?.capabilities ?? [])
    .filter((c): c is ModelCapabilityId =>
      LITERT_CAPABILITY_IDS.includes(c as ModelCapabilityId),
    )
    .map((c) => ({
      id: c,
      label: t(MODEL_CAPABILITY_KEYS[c]),
      icon: MODEL_CAPABILITY_ICONS[c],
    }));

  //installed model detail sheet
  const litertModelDetailSheet = (
    <DrawerSheet
      visible={installedModel !== null}
      onClose={() => setInstalledModel(null)}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      {installedModel && installedEntry && (
        <SheetBody style={styles.addModelSheetBody}>
          <SheetScrollView
            contentContainerStyle={styles.addModelSheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentCard}>
              <View style={styles.litertDetailHeader}>
                <View style={styles.litertDetailTile}>
                  <Image
                    source={{
                      uri: modelAvatarUrl(
                        installedEntry,
                        installedEntry.repoId,
                      ),
                    }}
                    style={styles.litertTileImage}
                  />
                </View>
                <View style={styles.litertDetailInfo}>
                  <Text style={styles.litertDetailName}>
                    {installedEntry.label}
                  </Text>
                  {!!installedPublisher && (
                    <Text style={styles.litertDetailMeta}>
                      {installedPublisher}
                    </Text>
                  )}
                  <Text style={styles.litertDetailMeta}>
                    {formatBytes(installedEntry.sizeBytes)}
                  </Text>
                  {installedCapabilities.map((capability) => (
                    <View key={capability.id} style={styles.litertCapability}>
                      <Image
                        source={capability.icon}
                        style={styles.litertCapabilityIcon}
                        tintColor={Colors.textSecondary}
                      />
                      <Text style={styles.litertDetailMeta}>
                        {capability.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <Text style={[styles.settingLabel, styles.litertDetailSection]}>
                {t("settings.litert.description")}
              </Text>
              <Text style={styles.helpText}>
                {installedModel.description === undefined
                  ? t("settings.litert.loading")
                  : (installedModel.description ??
                    t("settings.litert.noDescription"))}
              </Text>
            </View>

            <View style={styles.contentCard}>
              <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
                <Group>
                  <ActionButton
                    icon={binIcon}
                    label={t("settings.litert.deleteModel")}
                    onPress={() =>
                      handleDeleteLitert({
                        id: installedEntry.repoId,
                        label: installedEntry.label,
                        sizeStr: formatBytes(installedEntry.sizeBytes),
                      })
                    }
                  />
                </Group>
              </View>
            </View>
          </SheetScrollView>
        </SheetBody>
      )}
    </DrawerSheet>
  );

  const profileEditSheet = (
    <DrawerSheet
      visible={profileEditVisible}
      onClose={() => {
        setConfirmedName(name);
        setProfileEditVisible(false);
        HubSync.renameProfile(name).catch((e) => console.warn("[HubSync] profile rename failed:", e));
      }}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.addModelSheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: sheetMaxHeight,
        },
      ]}
      desktopStyle={styles.addModelSheetDesktop}
    >
      <SheetScrollView
        contentContainerStyle={styles.addModelSheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
              {t("settings.profile.name")}
            </Text>
            <Group>
              <TextInputField
                icon={penPlaceholderIcon}
                placeholder={t("onboarding.name.placeholder")}
                value={name}
                onChangeText={setName}
                onSubmitEditing={() => setConfirmedName(name)}
              />
            </Group>
          </View>
        </View>
      </SheetScrollView>
    </DrawerSheet>
  );

  if (isDesktop) {
    if (!desktopMounted) return null;
    const windowTranslateY = largeScreenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-10, 0],
    });

    return (
      <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
        {!windowed && (
          <Animated.View style={[styles.overlay, { opacity: largeScreenAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>
        )}

        <View
          style={[styles.desktopWindowWrapper, windowed && styles.windowedWrapper]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.desktopWindow,
              windowed && styles.windowedWindow,
              {
                opacity: largeScreenAnim,
                transform: [{ translateY: windowTranslateY }],
              },
            ]}
          >
            <View style={[styles.desktopNav, windowed && styles.windowedColumn]}>
              {windowed ? (
                renderSidebar()
              ) : (
              <View style={styles.innerContainer}>
                {/* the os window already has its own close button */}
                {!windowed && (
                  <View
                    style={[styles.fixedBackWrapper, { top: Spacing.xxl2 }]}
                    pointerEvents="box-none"
                  >
                    <DrawerBackButton
                      kind="close"
                      onPress={onClose}
                      scrolled={navScrolled}
                    />
                  </View>
                )}
                <ScrollView
                  onScroll={(e) =>
                    setNavScrolled(e.nativeEvent.contentOffset.y > 10)
                  }
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingTop: Spacing.xxl2,
                    paddingBottom: 40,
                  }}
                >
                  {renderMainPage()}
                </ScrollView>
              </View>
              )}
            </View>

            <View
              style={[styles.desktopPage, windowed && styles.windowedColumn]}
              onLayout={(e) => setDesktopPageWidth(e.nativeEvent.layout.width)}
            >
              <View style={styles.innerContainer}>
                {SUB_PAGE_PARENT[desktopPage] !== "main" && (
                  <View
                    style={[styles.fixedBackWrapper, { top: Spacing.xxl2 }]}
                    pointerEvents="box-none"
                  >
                    <DrawerBackButton
                      kind="back"
                      onPress={handleBack}
                      scrolled={isScrolled}
                      pulseKey={desktopPage}
                    />
                  </View>
                )}
                {/* switching section swaps pages, only nested pages push */}
                <PageStack
                  key={desktopSection}
                  page={desktopPage}
                  visible={visible}
                  width={desktopPageWidth || DESKTOP_WINDOW_MAX_WIDTH}
                  parentOf={subPageParent}
                  gestureEnabled={!sheetOpen}
                  onBack={handleBack}
                  renderPage={renderScrollPage}
                />
              </View>
            </View>

            {addModelSheet}
            {ollamaAddServerSheet}
            {ollamaServerSheet}
            {hubServerSheet}
            {openaiAddServerSheet}
            {openaiServerSheet}
            {mcpAddServerSheet}
            {mcpDetailSheet}
            {cloudSetupSheet}
            {localModelDetailSheet}
            {litertDownloadSheet}
            {litertModelDetailSheet}
            {profileEditSheet}
          </Animated.View>
        </View>
        {notificationModal}
      </View>
    );
  }

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [drawerWidth, 0],
  });

  //settle before state change
  const dismiss = () => {
    settleDrawer(progress, false);
    onClose();
  };

  const mobileDrawer = (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          { width: drawerWidth },
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        {innerContent}
      </Animated.View>

      {notificationModal}
      {addModelSheet}
      {ollamaAddServerSheet}
      {ollamaServerSheet}
      {hubServerSheet}
      {openaiAddServerSheet}
      {openaiServerSheet}
      {mcpAddServerSheet}
      {mcpDetailSheet}
      {cloudSetupSheet}
      {localModelDetailSheet}
      {litertDownloadSheet}
      {litertModelDetailSheet}
      {profileEditSheet}
    </View>
  );

  return mobileDrawer;
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      zIndex: 1000,
      elevation: 1000,
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: Colors.scrimDrawer,
    },
    content: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      paddingHorizontal: Spacing.lg2,
      overflow: "hidden",
    },
    desktopWindowWrapper: {
      ...StyleSheet.absoluteFill,
      padding: Spacing.xxl2,
      //clears the tauri title bar
      paddingTop:
        Spacing.xxl2 +
        (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
          ? 32
          : 0),
    },
    desktopWindow: {
      flex: 1,
      width: "100%",
      maxWidth: DESKTOP_WINDOW_MAX_WIDTH,
      alignSelf: "center",
      flexDirection: "row",
      backgroundColor: Colors.groupedBackground,
      borderRadius: Radius.window,
      borderWidth: 2,
      borderColor: Colors.border,
      overflow: "hidden",
    },
    //the os window frames it, the title bar strip stays inside each column
    windowedWrapper: {
      padding: 0,
      paddingTop: 0,
    },
    windowedWindow: {
      maxWidth: "100%",
      borderRadius: 0,
      borderWidth: 0,
    },
    windowedColumn: {
      paddingTop: 32,
    },
    sidebarButton: {
      borderRadius: Radius.pill,
    },
    sidebarActions: {
      marginBottom: Spacing.xxl,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
    },
    desktopNav: {
      backgroundColor: Colors.surface,
      width: 320,
      paddingHorizontal: Spacing.lg2,
      borderRightWidth: 2,
      borderRightColor: Colors.border,
    },
    desktopPage: {
      flex: 1,
      paddingHorizontal: Spacing.lg2,
      overflow: "hidden",
    },
    innerContainer: {
      flex: 1,
      position: "relative",
    },
    fixedBackWrapper: {
      position: "absolute",
      left: 0,
      zIndex: 100,
      elevation: 10,
      width: 40,
      height: 40,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.xxxl,
      minHeight: 40,
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
    menuContainer: {
      flex: 1,
    },
    subPageContainer: {
      flex: 1,
    },
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
      marginBottom: Spacing.xxl2,
    },
    gradientTop: {
      position: "absolute",
      top: 0,
      left: -Spacing.lg2,
      right: -Spacing.lg2,
      height: 60,
      zIndex: 10,
    },
    gradientBottom: {
      position: "absolute",
      bottom: 0,
      left: -Spacing.lg2,
      right: -Spacing.lg2,
      height: 60,
      zIndex: 10,
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    addModelSheet: {
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
    addModelSheetDesktop: {
      width: 560,
    },
    //rows like the chat details sheet
    infoGroup: {
      borderWidth: 0,
    },
    localModelFactValue: {
      flexShrink: 1,
      maxWidth: "60%",
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    litertDetailHeader: {
      flexDirection: "row",
      gap: Spacing.lg2,
    },
    litertDetailTile: {
      width: 120,
      height: 120,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      overflow: "hidden",
    },
    litertTileImage: {
      width: "100%",
      height: "100%",
    },
    litertDetailInfo: {
      flex: 1,
    },
    litertDetailName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.lg,
      color: Colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    litertDetailMeta: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      lineHeight: 20,
    },
    litertCapability: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs2,
    },
    litertCapabilityIcon: {
      width: 14,
      height: 14,
    },
    modelToggleName: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      marginRight: Spacing.lg2,
    },
    modelToggleLabel: {
      flexShrink: 1,
    },
    modelToggleArrowOpen: {
      transform: [{ rotate: "90deg" }],
    },
    modelCapabilities: {
      gap: Spacing.md,
      marginTop: Spacing.lg,
      paddingLeft: Spacing.xxl,
    },
    litertDetailDownload: {
      marginTop: Spacing.lg2,
    },
    litertDetailSection: {
      marginTop: Spacing.xxl,
    },
    //texts inset like settingLabel, controls stay on the edge
    cloudModelText: {
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    cloudModelCapabilityLabel: {
      paddingHorizontal: Spacing.md,
    },
    cloudModelCapabilities: {
      gap: Spacing.md,
      marginTop: Spacing.md,
    },
    litertFamilies: {
      gap: Spacing.xxl,
    },
    litertFamilyTitle: {
      marginBottom: Spacing.md,
    },
    litertCarousel: {
      gap: Spacing.lg2,
      paddingHorizontal: Spacing.md,
    },
    litertCard: {
      width: 96,
      alignItems: "center",
    },
    litertCardTile: {
      width: 96,
      height: 96,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      marginBottom: Spacing.md,
      overflow: "hidden",
    },
    litertCardName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textPrimary,
      textAlign: "center",
    },
    litertCardMeta: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.labelSm,
      color: Colors.textSecondary,
      marginTop: Spacing.xs2,
    },
    litertRowMeta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.micro,
      color: Colors.textMuted,
    },
    litertSearchResultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    litertSearchResultTile: {
      width: 44,
      height: 44,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      overflow: "hidden",
    },
    litertSearchResultInfo: {
      flex: 1,
      gap: Spacing.xs2,
    },
    litertSearchResultName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
    },
    addModelSheetBody: {
      flexShrink: 1,
      position: "relative",
    },
    litertSheetBody: {
      flex: 1,
    },
    litertBackWrapper: {
      position: "absolute",
      top: Spacing.md + 4,
      left: Spacing.lg2,
      width: 40,
      height: 40,
      zIndex: 10,
      elevation: 10,
    },
    litertSearchWithBack: {
      marginLeft: 40 + Spacing.md,
    },
    addModelSheetContent: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
    },
    groupSpacing: {
      marginBottom: Spacing.xxl,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
    },
    mainPageGroup: {
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
    },
    groupSpacingTight: {
      marginBottom: Spacing.lg2,
    },
    navItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    navItemLast: {
      marginBottom: 0,
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
    //same as the image preview rows
    infoValue: {
      flexShrink: 1,
      maxWidth: "60%",
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    cloudAccount: {
      alignItems: "center",
      paddingVertical: Spacing.xl2,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.lg2,
    },
    cloudAvatar: {
      width: 80,
      height: 80,
      //stays a circle at this size
      borderRadius: Radius.pill * 2,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surfaceSubtle,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.lg2,
    },
    cloudAvatarIcon: {
      width: 32,
      height: 32,
    },
    cloudName: {
      fontSize: FontSizes.lg,
      fontFamily: Fonts.mono,
      color: Colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.xs2,
    },
    cloudEmail: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.body,
      color: Colors.textMuted,
      textAlign: "center",
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
    permissionBadge: {
      paddingVertical: 3,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    permissionBadgeAllowed: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    permissionBadgeText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.labelSm,
      color: Colors.textSecondary,
    },
    permissionBadgeTextAllowed: {
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
    toggleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
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
    toggleGroupRowItem: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
    },
    toggleGroupCardPressed: {
      backgroundColor: Colors.surfacePressed,
    },
    toggleDivider: {
      width: 2,
      height: 34,
      backgroundColor: Colors.border,
      marginRight: Spacing.lg2,
    },
    checkboxRow: {
      flex: 1,
      justifyContent: "space-between",
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
    assistantStatusText: {
      fontSize: FontSizes.bodyMd,
      fontFamily: Fonts.body,
      marginTop: Spacing.sm,
      marginBottom: Spacing.md,
      lineHeight: 20,
      paddingHorizontal: Spacing.md,
    },
    assistantStatusOn: {
      color: Colors.primary,
    },
    assistantStatusOff: {
      color: Colors.textMuted,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
  });
