import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import {
  CatalogModel,
  HubModels,
  LlamaStatus,
  ModelFile,
  ModelRepo,
  OperaHub,
} from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import { pressStyle } from "../ui/pressStyle";
import TextInputField from "../ui/TextInputField";

const searchIcon = require("../../../assets/icons/search.png");
const serverIcon = require("../../../assets/icons/server.png");
const downloadIcon = require("../../../assets/icons/download.png");

//fast while something moves, idle otherwise
const BUSY_POLL_MS = 1500;
const IDLE_POLL_MS = 10000;

type Card = { key: string; title: string; status: string; error?: boolean; onPress: () => void };
type Confirm = { title: string; message: string; action: string; danger?: boolean; run: () => Promise<unknown> };

const stem = (file: string) => file.replace(/\.gguf$/, "");

//llama.cpp models the hub runs, admins only
export default function HubModelsSection() {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const [models, setModels] = useState<HubModels | null>(null);
  const [status, setStatus] = useState<LlamaStatus | null>(null);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<ModelRepo[] | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [files, setFiles] = useState<ModelFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const fail = useCallback(
    (e: unknown) => setError(t("hubModels.failed", { error: e instanceof Error ? e.message : String(e) })),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    OperaHub.models()
      .then(async (api) => {
        const [first, list] = await Promise.all([api.status(), api.catalog()]);
        if (cancelled) return;
        setModels(api);
        setStatus(first);
        setCatalog(list);
      })
      .catch((e) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
  }, [fail]);

  const busy = !!status && (status.state === "installing" || status.downloads.some((d) => !d.error));
  useEffect(() => {
    if (!models) return;
    const timer = setInterval(
      () => models.status().then(setStatus).catch(() => {}),
      busy ? BUSY_POLL_MS : IDLE_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [models, busy]);

  const act = async (run: () => Promise<LlamaStatus>) => {
    setConfirm(null);
    setError(null);
    try {
      setStatus(await run());
    } catch (e) {
      fail(e);
    }
  };

  const askDownload = (repoId: string, file: string, size: number, name = stem(file)) =>
    setConfirm({
      title: t("hubModels.downloadTitle", { name }),
      message: t("hubModels.downloadMessage", { size: formatBytes(size) }),
      action: t("hubModels.download"),
      run: () => act(() => models!.download(repoId, file)),
    });

  const search = async () => {
    if (!models || !query.trim()) return;
    setError(null);
    setRepo(null);
    setFiles(null);
    try {
      setRepos(await models.search(query.trim()));
    } catch (e) {
      fail(e);
    }
  };

  const openRepo = async (id: string) => {
    if (!models) return;
    setRepo(id);
    setFiles(null);
    try {
      setFiles(await models.files(id));
    } catch (e) {
      fail(e);
    }
  };

  const installed = new Set(status?.installed.map((m) => m.file));
  const downloading = new Set(status?.downloads.map((d) => d.file));
  const nameOf = (file: string) => catalog.find((m) => m.file === file)?.name ?? stem(file);

  const ownCards: Card[] = [
    ...(status?.downloads ?? []).map((d) => ({
      key: `download-${d.file}`,
      title: nameOf(d.file),
      error: !!d.error,
      status: d.error
        ? t("hubModels.downloadFailed")
        : t("hubModels.downloading", { percent: d.total ? Math.floor((d.received / d.total) * 100) : 0 }),
      onPress: () =>
        setConfirm({
          title: t("hubModels.cancelTitle", { name: nameOf(d.file) }),
          message: t("hubModels.cancelMessage"),
          action: t("hubModels.cancel"),
          danger: true,
          run: () => act(() => models!.cancel(d.file)),
        }),
    })),
    ...(status?.installed ?? []).map((m) => ({
      key: m.file,
      title: nameOf(m.file),
      status: formatBytes(m.size),
      onPress: () =>
        setConfirm({
          title: t("hubModels.deleteTitle", { name: nameOf(m.file) }),
          message: t("hubModels.deleteMessage"),
          action: t("hubModels.delete"),
          danger: true,
          run: () => act(() => models!.remove(m.file)),
        }),
    })),
  ];
  const catalogCards: Card[] = catalog
    .filter((m) => !installed.has(m.file) && !downloading.has(m.file))
    .map((m) => ({
      key: m.file,
      title: m.name,
      status: formatBytes(m.size),
      onPress: () => askDownload(m.repo, m.file, m.size, m.name),
    }));

  const runtime = !status
    ? t("hubModels.loading")
    : status.state === "running"
      ? t("hubModels.running", { backend: (status.backend ?? "cpu").toUpperCase() })
      : status.state === "installing"
        ? t("hubModels.installing")
        : status.state === "failed"
          ? t("hubModels.startFailed", { error: status.message ?? "" })
          : t("hubModels.idle");

  const renderGrid = (cards: Card[]) => (
    <View
      style={[styles.grid, { marginTop: Spacing.md }]}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        if (width > 0 && width !== gridWidth) setGridWidth(width);
      }}
    >
      {cards.map((card, index) => {
        //a lone last card takes the row
        const lastOdd = cards.length % 2 !== 0 && index === cards.length - 1;
        const width = lastOdd ? "100%" : gridWidth > 0 ? Math.floor((gridWidth - Spacing.md) / 2) - 1 : "47%";
        return (
          <Pressable
            key={card.key}
            style={pressStyle([styles.card, { width, flexGrow: 1 }, lastOdd && styles.cardWide], "surface")}
            onPress={() => {
              Vibration.vibrate(8);
              card.onPress();
            }}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>
              {card.title}
            </Text>
            <Text style={[styles.cardStatus, card.error && styles.cardError]} numberOfLines={1}>
              {card.status}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      {/* runtime and models on the hub */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("hubModels.title")}</Text>
          <Text style={styles.helpText}>{error ?? runtime}</Text>
          {ownCards.length > 0 ? (
            renderGrid(ownCards)
          ) : (
            <Text style={styles.helpText}>{t("hubModels.empty")}</Text>
          )}
        </View>
      </View>

      {/* recommended models */}
      {catalogCards.length > 0 && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>{t("hubModels.catalog")}</Text>
            <Text style={styles.helpText}>{t("hubModels.catalogHelp")}</Text>
            {renderGrid(catalogCards)}
          </View>
        </View>
      )}

      {/* hugging face search */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("hubModels.search")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{t("hubModels.searchHelp")}</Text>
          <Group style={repos ? styles.groupSpacingTight : undefined}>
            <TextInputField
              icon={searchIcon}
              placeholder={t("hubModels.searchPlaceholder")}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Group>
          {repos && !repo && (
            <Group>
              {repos.length === 0 ? (
                <ActionButton label={t("hubModels.noResults")} />
              ) : (
                repos.map((r) => (
                  <ActionButton
                    key={r.repo}
                    icon={serverIcon}
                    label={r.repo}
                    onPress={() => openRepo(r.repo)}
                    rightElement={
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {t("hubModels.downloads", { count: r.downloads.toLocaleString() })}
                      </Text>
                    }
                  />
                ))
              )}
            </Group>
          )}
          {repo && (
            <Group>
              <ActionButton icon={serverIcon} label={repo} onPress={() => setRepo(null)} />
              {(files ?? []).map((f) => (
                <ActionButton
                  key={f.file}
                  icon={downloadIcon}
                  label={stem(f.file)}
                  disabled={installed.has(f.file) || downloading.has(f.file)}
                  onPress={() => askDownload(repo, f.file, f.size)}
                  rightElement={
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {formatBytes(f.size)}
                    </Text>
                  }
                />
              ))}
            </Group>
          )}
        </View>
      </View>

      <NotificationModal
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        onClose={() => setConfirm(null)}
        buttons={[
          { text: t("common.cancel"), style: "secondary", onPress: () => setConfirm(null) },
          {
            text: confirm?.action ?? "",
            style: confirm?.danger ? "danger" : "primary",
            onPress: () => confirm?.run(),
          },
        ]}
      />
    </>
  );
}

//same values as settings drawer pages
const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
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
    infoValue: {
      flexShrink: 1,
      maxWidth: "60%",
      textAlign: "right",
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
    },
    card: {
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
    cardWide: {
      minHeight: 70,
    },
    cardTitle: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      lineHeight: 18,
      color: Colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.xs,
    },
    cardStatus: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      textAlign: "center",
    },
    cardError: {
      color: Colors.error,
    },
  });
