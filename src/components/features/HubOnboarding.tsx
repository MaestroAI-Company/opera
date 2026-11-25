import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  BackHandler,
  DeviceEventEmitter,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { runHubModels, useHubModels } from "../../hooks/useHubModels";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useResponsive } from "../../hooks/useResponsive";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { AIModule } from "../../services/ai/AIModule";
import { formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import {
  HUB_PROVIDER_ID,
  getEnabledProviders,
  getHubServers,
  patchHubServer,
  serializeProviders,
} from "../../services/ai/providers/sources";
import { AppEvents } from "../../services/events";
import { HubSync } from "../../services/hub/HubSync";
import { HubSettings, HubStatus, PairedHub, SamplerHub, hubErrorText } from "../../services/hub/SamplerHubService";
import { LLAMA_SERVER_URL } from "../../services/hub/modelOptions";
import { McpService } from "../../services/mcp/McpService";
import { Settings } from "../../services/settings/SettingsService";
import { SyncPrefs, SyncPrefsStore } from "../../services/SyncPrefs";
import ActionButton from "../ui/ActionButton";
import CardGrid from "../ui/CardGrid";
import Group from "../ui/Group";
import Reveal from "../ui/Reveal";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";
import { pressStyle } from "../ui/pressStyle";
import ButterflyCluster from "./ButterflyCluster";
import HubQrSheet, { HubQrContent } from "./HubQrSheet";
import AppIcon from "../ui/AppIcon";
import arrowIcon from "../../../assets/icons/arrow.svg";
import hubIcon from "../../../assets/icons/server2.svg";
import profilIcon from "../../../assets/icons/person_add2.svg";

const BACK_BUTTON_SIZE = 56;
//kept local so new devices onboard
const DONE_KEY = "hubOnboardingDone";

const doneHubs = async (): Promise<string[]> => {
  try {
    return JSON.parse((await Settings.getLocal(DONE_KEY)) ?? "[]");
  } catch {
    return [];
  }
};

export async function isHubOnboardingDone(hubId: string): Promise<boolean> {
  return (await doneHubs()).includes(hubId);
}

//a rejoined hub walks through again
export async function forgetHubOnboarding(hubId: string): Promise<void> {
  await Settings.setLocal(DONE_KEY, JSON.stringify((await doneHubs()).filter((id) => id !== hubId)));
}

async function markHubOnboardingDone(hubId: string): Promise<void> {
  const done = await doneHubs();
  if (!done.includes(hubId)) await Settings.setLocal(DONE_KEY, JSON.stringify([...done, hubId]));
}

type Step = {
  key: string;
  render: () => ReactNode;
  //centered like the app ready step
  centered?: boolean;
  cta?: string;
  //false keeps the step on error
  beforeNext?: () => Promise<boolean>;
  link?: { label: string; kind: "later" | "addDevice" };
};

type HubOnboardingProps = {
  mode: "admin" | "member";
  hub: PairedHub;
  //member only, greeted on ready step
  profileName?: string;
  //admin only, hub status and settings
  status?: HubStatus | null;
  settings?: HubSettings | null;
  onChangeSettings?: (patch: Partial<HubSettings>) => void;
  //clears any floating top bar
  topInset?: number;
  onDone: () => void;
};

//hub first run, app onboarding look
export default function HubOnboarding({
  mode,
  hub,
  profileName,
  status,
  settings,
  onChangeSettings,
  topInset,
  onDone,
}: HubOnboardingProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const { isLargeScreen, isDesktop } = useResponsive();

  const [step, setStep] = useState(0);
  const contentOpacity = useAnimatedValue(1);
  const backButtonProgress = useAnimatedValue(0);
  const busy = useRef(false);
  const [qrSheet, setQrSheet] = useState<"invite" | "link" | null>(null);
  //new code once a device joined
  const [qrKey, setQrKey] = useState(0);

  const hubName = status?.name ?? hub.name;
  const [nameDraft, setNameDraft] = useState(hubName);
  const [savedName, setSavedName] = useState(hubName);
  const [nameError, setNameError] = useState<string | null>(null);

  const [modelFile, setModelFile] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<SyncPrefs>(() => SyncPrefsStore.get());
  const [offersTick, setOffersTick] = useState(0);
  const [modelNames, setModelNames] = useState<string[]>([]);

  const isAdmin = mode === "admin";
  //module lists recomputed each refresh
  const { hubLlama, hubMcp } = useMemo(
    () => ({
      hubLlama: getHubServers().find((s) => s.url === LLAMA_SERVER_URL),
      hubMcp: McpService.getHubServers(),
    }),
    //tick marks a provider refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offersTick],
  );
  const offers = !!hubLlama || hubMcp.length > 0;
  const keys = isAdmin
    ? ["name", "share", ...(settings?.models ? ["model"] : []), "reach", "connect"]
    : ["sync", ...(offers ? ["offers"] : []), "ready"];
  const current = keys[Math.min(step, keys.length - 1)];
  const { catalog } = useHubModels(isAdmin && current === "model");

  //old hubs send no flags, pick smallest
  const allFitting = catalog.filter((m) => m.fits !== false);
  const smallest = allFitting.length > 0 ? allFitting.reduce((a, b) => (b.size < a.size ? b : a)) : null;
  const advised = allFitting.find((m) => m.recommended) ?? smallest;
  //advised first then other families
  const family = (m: { name: string }) => m.name.split(/[^a-z]/i)[0].toLowerCase();
  const others = [...allFitting]
    .sort((a, b) => b.size - a.size)
    .filter((m, i, all) => m !== advised && family(m) !== (advised && family(advised)) && all.findIndex((o) => family(o) === family(m)) === i);
  const lead = [...(advised ? [advised] : []), ...others];
  //same family variants fill the gaps
  const rest = allFitting.filter((m) => !lead.includes(m)).sort((a, b) => b.size - a.size);
  const fitting = [...lead, ...rest].slice(0, 4);
  const pickedModel = fitting.find((m) => m.file === modelFile) ?? advised;

  //offers step waits for the hub
  const loadProviders = () =>
    HubSync.refreshProviders()
      .catch((e) => console.warn("[HubOnboarding] hub providers not loaded:", e))
      .finally(() => setOffersTick((tick) => tick + 1));

  //member needs sync choices and hub offers
  useEffect(() => {
    if (isAdmin) return;
    SyncPrefsStore.load().then(setPrefs);
    loadProviders();
    const subs = [AppEvents.settingsChanged, AppEvents.mcpServersChanged].map((event) =>
      DeviceEventEmitter.addListener(event, () => setOffersTick((tick) => tick + 1)),
    );
    return () => subs.forEach((sub) => sub.remove());
  }, [isAdmin]);

  const hasLlama = !!hubLlama;
  useEffect(() => {
    if (isAdmin || !hasLlama) return;
    AIModule.getModelsFor(HUB_PROVIDER_ID, LLAMA_SERVER_URL, true)
      .then(setModelNames)
      .catch(() => setModelNames([]));
  }, [isAdmin, hasLlama, offersTick]);

  const goTo = useCallback(
    (next: number) => {
      if (busy.current) return;
      busy.current = true;
      Keyboard.dismiss();
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => setStep(next));
    },
    [contentOpacity],
  );

  //restore after commit to avoid flashes
  useEffect(() => {
    contentOpacity.setValue(1);
    busy.current = false;
  }, [step, contentOpacity]);

  //hardware back walks steps backward
  useEffect(() => {
    if (step === 0) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goTo(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step, goTo]);

  const showBack = step > 0;
  //slides the back button open, cta reflows with it
  useEffect(() => {
    Animated.timing(backButtonProgress, {
      toValue: showBack ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showBack, backButtonProgress]);

  const finish = async () => {
    if (busy.current) return;
    busy.current = true;
    await markHubOnboardingDone(hub.id);
    onDone();
  };

  const toggleHubModels = async (on: boolean) => {
    const enabled = getEnabledProviders();
    if (on && !enabled.includes(HUB_PROVIDER_ID)) {
      await Settings.set("enabledProviders", serializeProviders([...enabled, HUB_PROVIDER_ID]));
    }
    await patchHubServer(LLAMA_SERVER_URL, { disabled: on ? undefined : true });
    //pickers rebuild their sources
    DeviceEventEmitter.emit(AppEvents.settingsChanged);
  };

  const renderHead = (title: string, lead: string) => (
    <Reveal style={styles.head}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.lead}>{lead}</Text>
    </Reveal>
  );

  const renderToggleRow = (label: string, help: string, checked: boolean, onToggle: (value: boolean) => void, last = false) => (
    <View style={[styles.settingRowVertical, last && styles.lastRow]}>
      <View style={styles.toggleGroupRow}>
        <View style={styles.toggleGroupContent}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.helpText}>{help}</Text>
        </View>
        <Toggle checked={checked} onToggle={onToggle} />
      </View>
    </View>
  );

  const renderName = () => (
    <>
      {renderHead(t("hubOnboarding.name.title"), t("hubOnboarding.name.lead"))}
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          <Text style={styles.settingLabel}>{t("settings.hub.renameLabel")}</Text>
          <Text style={styles.helpText}>{nameError ?? t("settings.hub.renameHelp")}</Text>
          <Group>
            <TextInputField
              icon={hubIcon}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t("settings.hub.name")}
              autoCorrect={false}
            />
          </Group>
        </View>
      </Reveal>
    </>
  );

  const renderShare = () => (
    <>
      {renderHead(t("hubOnboarding.share.title", { hub: savedName }), t("hubOnboarding.share.lead"))}
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          {renderToggleRow(
            t("hubOnboarding.share.models"),
            t("hubOnboarding.share.modelsHelp", { hub: savedName }),
            !!settings?.models,
            (value) => onChangeSettings?.({ models: value }),
          )}
          {renderToggleRow(
            t("hubOnboarding.share.mcp"),
            t("hubOnboarding.share.mcpHelp", { hub: savedName }),
            !!settings?.mcpServers,
            (value) => onChangeSettings?.({ mcpServers: value }),
          )}
          {renderToggleRow(
            t("hubOnboarding.share.providers"),
            t("hubOnboarding.share.providersHelp", { hub: savedName }),
            !!settings?.shareProviders,
            (value) => onChangeSettings?.({ shareProviders: value }),
            true,
          )}
        </View>
      </Reveal>
    </>
  );

  const renderModel = () => (
    <>
      {renderHead(t("hubOnboarding.model.title"), t("hubOnboarding.model.lead", { hub: savedName }))}
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          {modelError && <Text style={styles.helpText}>{modelError}</Text>}
          <CardGrid
            cards={fitting.map((model) => ({
              key: model.file,
              title: model.name,
              status:
                model === advised
                  ? `${formatBytes(model.size)} · ${t("hubOnboarding.model.recommended")}`
                  : formatBytes(model.size),
              selected: model.file === pickedModel?.file,
              onPress: () => setModelFile(model.file),
            }))}
          />
        </View>
      </Reveal>
    </>
  );

  //older hubs report no relays
  const relays = status?.relays ?? [];

  const renderReach = () => (
    <>
      {renderHead(t("hubOnboarding.reach.title"), "")}
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          {renderToggleRow(
            t("hubOnboarding.reach.lan"),
            t("hubOnboarding.reach.lanHelp", { hub: savedName }),
            !!settings?.lanDiscovery,
            (value) => onChangeSettings?.({ lanDiscovery: value }),
          )}
          <View style={[styles.settingRowVertical, styles.lastRow]}>
            <Text style={styles.settingLabel}>{t("hubOnboarding.reach.outside")}</Text>
            <Text style={styles.helpText}>{t("hubOnboarding.reach.outsideHelp")}</Text>
            <Group style={styles.infoGroup}>
              {(relays.length > 0 ? relays : [t("hubOnboarding.reach.publicRelay")]).map((relay) => (
                <ActionButton key={relay} label={relay} />
              ))}
            </Group>
          </View>
        </View>
      </Reveal>
    </>
  );

  const renderConnect = () => (
    <>
      {renderHead(t("hubOnboarding.connect.title"), t("hubOnboarding.connect.lead"))}
      <Reveal delay={100}>
        <HubQrContent key={qrKey} active hub={hub} mode="link" bare onClose={() => setQrKey((key) => key + 1)} />
        <Text style={[styles.caption, styles.centered]}>{t("hubOnboarding.connect.caption")}</Text>
      </Reveal>
      <Reveal delay={160}>
        <View style={styles.contentCard}>
          <Group>
            <ActionButton icon={profilIcon} label={t("hubOnboarding.connect.invite")} onPress={() => setQrSheet("invite")} />
          </Group>
        </View>
      </Reveal>
    </>
  );

  const syncRows = [
    { key: "data", label: t("hubOnboarding.sync.data"), help: t("hubOnboarding.sync.dataHelp") },
    { key: "settings", label: t("hubOnboarding.sync.settings"), help: t("hubOnboarding.sync.settingsHelp") },
    { key: "providers", label: t("hubOnboarding.sync.providers"), help: t("hubOnboarding.sync.providersHelp") },
  ] as const;

  const renderSync = () => (
    <>
      {renderHead(t("hubOnboarding.sync.title"), t("hubOnboarding.sync.lead"))}
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          {syncRows.map((row, index) => (
            <Fragment key={row.key}>
              {renderToggleRow(
                row.label,
                row.help,
                prefs[row.key],
                (value) => SyncPrefsStore.set(row.key, value).then(setPrefs),
                index === syncRows.length - 1,
              )}
            </Fragment>
          ))}
        </View>
      </Reveal>
    </>
  );

  const renderOffers = () => (
    <>
      {renderHead(t("hubOnboarding.offers.title", { hub: hubName }), t("hubOnboarding.offers.lead", { hub: hubName }))}
      <Reveal delay={100}>
        <View style={styles.contentCard}>
          {hubLlama && (
            <>
              {renderToggleRow(t("hubOnboarding.offers.models"), "", !hubLlama.disabled, async (value) => {
                await toggleHubModels(value);
                setOffersTick((tick) => tick + 1);
              }, modelNames.length === 0 && hubMcp.length === 0)}
              {modelNames.length > 0 && (
                <Group style={[styles.infoGroup, hubMcp.length > 0 && styles.listSpacing]}>
                  {modelNames.map((name) => (
                    <ActionButton key={name} label={name} />
                  ))}
                </Group>
              )}
            </>
          )}
          {hubMcp.length > 0 && (
            <View style={[styles.settingRowVertical, styles.lastRow]}>
              <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>{t("hubOnboarding.offers.mcp")}</Text>
              <Group style={styles.infoGroup}>
                {hubMcp.map((server) => (
                  <ActionButton
                    key={server.id}
                    label={server.name}
                    rightElement={
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {t("hubOnboarding.offers.tools", { count: McpService.getStatus(server.id).toolCount })}
                      </Text>
                    }
                  />
                ))}
              </Group>
            </View>
          )}
        </View>
      </Reveal>
      <Reveal delay={160}>
        <Text style={styles.caption}>{t("hubOnboarding.offers.help")}</Text>
      </Reveal>
    </>
  );

  const renderReady = () => {
    const name = profileName?.trim();
    return (
      <View style={styles.readyContent}>
        <ButterflyCluster style={styles.readyButterfly} />
        <Reveal delay={120}>
          <Text style={[styles.title, styles.centered]}>
            {name ? t("hubOnboarding.ready.title", { name }) : t("hubOnboarding.ready.titleNoName")}
          </Text>
        </Reveal>
        <Reveal delay={240}>
          <Text style={[styles.lead, styles.centered]}>{t("hubOnboarding.ready.lead", { hub: hubName })}</Text>
        </Reveal>
      </View>
    );
  };

  const steps: Record<string, Step> = {
    name: {
      key: "name",
      render: renderName,
      beforeNext: async () => {
        const wanted = nameDraft.trim();
        if (wanted === savedName) return true;
        try {
          const effective = await SamplerHub.renameHub(hub, wanted);
          setSavedName(effective);
          setNameDraft(effective);
          setNameError(null);
          return true;
        } catch (e) {
          setNameError(t("settings.hub.renameFailed", { error: hubErrorText(e) }));
          return false;
        }
      },
    },
    share: { key: "share", render: renderShare },
    model: {
      key: "model",
      render: renderModel,
      cta: pickedModel ? t("hubOnboarding.model.download", { size: formatBytes(pickedModel.size) }) : undefined,
      beforeNext: async () => {
        if (!pickedModel) return true;
        try {
          await runHubModels((models) => models.download(pickedModel.repo, pickedModel.file));
          setModelError(null);
          return true;
        } catch (e) {
          setModelError(t("hubModels.failed", { error: hubErrorText(e) }));
          return false;
        }
      },
      link: { label: t("hubOnboarding.model.later"), kind: "later" },
    },
    reach: { key: "reach", render: renderReach },
    connect: { key: "connect", render: renderConnect, cta: t("hubOnboarding.finish") },
    sync: {
      key: "sync",
      render: renderSync,
      beforeNext: async () => {
        //first fetch may race the join
        await loadProviders();
        return true;
      },
    },
    offers: { key: "offers", render: renderOffers },
    ready: {
      key: "ready",
      render: renderReady,
      centered: true,
      cta: t("onboarding.ready.cta"),
      link: { label: t("hubOnboarding.ready.addDevice"), kind: "addDevice" },
    },
  };

  const index = keys.indexOf(current);
  const currentStep = steps[current];
  const isLast = index === keys.length - 1;

  const next = async () => {
    if (busy.current) return;
    if (currentStep.beforeNext) {
      busy.current = true;
      const proceed = await currentStep.beforeNext();
      busy.current = false;
      if (!proceed) return;
    }
    if (isLast) finish();
    else goTo(index + 1);
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View
          style={[
            styles.frame,
            isLargeScreen && styles.frameLarge,
            { paddingTop: topInset ?? insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xxl },
          ]}
        >
          <View style={styles.header} />

          <Animated.View style={[styles.flex, { opacity: contentOpacity }]}>
            <ScrollView
              key={current}
              contentContainerStyle={[styles.scrollContent, !currentStep.centered && styles.scrollContentTop]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {currentStep.render()}
            </ScrollView>
          </Animated.View>

          {currentStep.link && (
            <View style={styles.linkWrap}>
              <Pressable
                accessibilityRole="button"
                onPress={() => (currentStep.link?.kind === "later" ? goTo(index + 1) : setQrSheet("link"))}
                style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
              >
                <Text style={styles.linkText}>{currentStep.link.label}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.footer}>
            <Animated.View
              pointerEvents={showBack ? "auto" : "none"}
              style={[
                styles.backButtonWrap,
                {
                  width: backButtonProgress.interpolate({ inputRange: [0, 1], outputRange: [0, BACK_BUTTON_SIZE] }),
                  marginRight: backButtonProgress.interpolate({ inputRange: [0, 1], outputRange: [0, Spacing.md] }),
                  opacity: backButtonProgress,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("onboarding.back")}
                onPress={() => goTo(index - 1)}
                style={pressStyle(styles.backButton, styles.backButtonPressed)}
              >
                <AppIcon source={arrowIcon} style={styles.backIcon} tintColor={Colors.textPrimary} />
              </Pressable>
            </Animated.View>
            <View style={styles.ctaWrap}>
              <Pressable onPress={next} style={pressStyle(styles.cta, styles.ctaPressed)}>
                <Text style={styles.ctaText}>
                  {currentStep.cta ?? (isLast ? t("hubOnboarding.finish") : t("onboarding.next"))}
                </Text>
                <AppIcon source={arrowIcon} style={styles.ctaIcon} tintColor={Colors.textOnPrimary} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <HubQrSheet
        visible={qrSheet !== null}
        onClose={() => setQrSheet(null)}
        hub={hub}
        mode={qrSheet ?? "link"}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
      />
    </View>
  );
}

//same values as the app onboarding
const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    flex: {
      flex: 1,
    },
    frame: {
      flex: 1,
      width: "100%",
      paddingHorizontal: Spacing.xxl2,
    },
    frameLarge: {
      alignSelf: "center",
      maxWidth: 520,
    },
    //keeps step titles where they were
    header: {
      height: 44,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
    },
    linkWrap: {
      alignItems: "center",
      marginBottom: Spacing.md,
    },
    linkButton: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    linkButtonPressed: {
      opacity: 0.6,
    },
    linkText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.bodyMd,
      color: Colors.textMuted,
      textDecorationLine: "underline",
    },
    //clips the button as its animated width reveals it
    backButtonWrap: {
      height: BACK_BUTTON_SIZE,
      overflow: "hidden",
    },
    backButton: {
      width: BACK_BUTTON_SIZE,
      height: BACK_BUTTON_SIZE,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    backButtonPressed: {
      backgroundColor: Colors.surfacePressed,
    },
    //pixel arrow points right so flip
    backIcon: {
      width: 16,
      height: 16,
      transform: [{ scaleX: -1 }],
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingVertical: Spacing.xxl2,
      gap: Spacing.xxl,
    },
    //middle steps read top down, not centered
    scrollContentTop: {
      justifyContent: "flex-start",
      paddingTop: Spacing.xl,
    },
    head: {
      gap: Spacing.md,
    },
    title: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.xxxl,
      lineHeight: 38,
      color: Colors.textPrimary,
    },
    lead: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.body,
      lineHeight: 22,
      color: Colors.textSecondary,
    },
    centered: {
      textAlign: "center",
    },
    //same card, label and help text as the settings pages
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      padding: Spacing.md,
    },
    settingRowVertical: {
      marginBottom: Spacing.xxl,
    },
    lastRow: {
      marginBottom: 0,
    },
    settingLabel: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    helpText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.bodyMd,
      lineHeight: 20,
      color: Colors.textMuted,
      marginTop: Spacing.xs,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
    },
    //muted line under a card
    caption: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.bodyMd,
      lineHeight: 20,
      color: Colors.textMuted,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
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
    infoGroup: {
      borderWidth: 0,
    },
    listSpacing: {
      marginBottom: Spacing.xxl,
    },
    infoValue: {
      flexShrink: 1,
      maxWidth: "60%",
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    readyContent: {
      alignItems: "center",
      gap: Spacing.xxl,
    },
    readyButterfly: {
      width: 220,
      height: 220,
    },
    ctaWrap: {
      flex: 1,
    },
    cta: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.xl2,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      backgroundColor: Colors.primary,
    },
    ctaPressed: {
      backgroundColor: Colors.primaryBright,
    },
    ctaText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.md,
      color: Colors.textOnPrimary,
    },
    ctaIcon: {
      width: 16,
      height: 16,
    },
  });
