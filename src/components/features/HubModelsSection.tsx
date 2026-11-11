import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import {
  hubModelAvatar,
  hubModelName,
  hubModelPublisher,
  runHubModels,
  useHubModels,
} from "../../hooks/useHubModels";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { AIModule } from "../../services/ai/AIModule";
import { fetchModelDescription, formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import { getHubServers, HUB_PROVIDER_ID } from "../../services/ai/providers/sources";
import { LLAMA_SERVER_URL } from "../../services/hub/modelOptions";
import ActionButton from "../ui/ActionButton";
import CardGrid, { type GridCard } from "../ui/CardGrid";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import ProgressBar from "../ui/ProgressBar";

const binIcon = require("../../../assets/icons/bin.png");
const cloudIcon = require("../../../assets/icons/cloud.png");
const downloadIcon = require("../../../assets/icons/download.png");
const cancelIcon = require("../../../assets/icons/cancel.png");

type HubModelsSectionProps = {
  onOpenModel: (file: string, name: string) => void;
};

//llama.cpp models the hub runs, admins only
export default function HubModelsSection({ onOpenModel }: HubModelsSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { status, catalog } = useHubModels();
  //models of the servers the hub relays, listed only
  const [relayed, setRelayed] = useState<GridCard[]>([]);
  useEffect(() => {
    let dropped = false;
    Promise.all(
      getHubServers()
        .filter((s) => s.url !== LLAMA_SERVER_URL)
        .map((s) =>
          AIModule.getModelsFor(HUB_PROVIDER_ID, s.url, true)
            .catch(() => [] as string[])
            .then((models) =>
              models.map((m) => ({
                key: `${s.url}|${m}`,
                title: m,
                status: s.provider,
                badge: s.kind === "openai" ? cloudIcon : undefined,
              })),
            ),
        ),
    ).then((lists) => !dropped && setRelayed(lists.flat()));
    return () => {
      dropped = true;
    };
  }, []);

  const nameOf = (file: string) => hubModelName(file, catalog);
  const cards: GridCard[] = [
    ...(status?.downloads ?? []).map((d) => ({
      key: `download-${d.file}`,
      title: nameOf(d.file),
      error: !!d.error,
      progress: d.error ? undefined : d.total ? d.received / d.total : 0,
      status: d.error
        ? t("hubModels.downloadFailed")
        : t("hubModels.downloading", { percent: d.total ? Math.floor((d.received / d.total) * 100) : 0 }),
      onPress: () => onOpenModel(d.file, nameOf(d.file)),
    })),
    ...(status?.installed ?? []).map((m) => ({
      key: m.file,
      title: nameOf(m.file),
      status: formatBytes(m.size),
      onPress: () => onOpenModel(m.file, nameOf(m.file)),
    })),
    ...relayed,
  ];

  return (
    <>
      {/* models on the hub */}
      {cards.length > 0 && (
        <View style={styles.contentCard}>
          <CardGrid cards={cards} />
        </View>
      )}
    </>
  );
}

//a running download opens its progress, an installed model its page
export function HubModelPage({ file, onDeleted }: { file: string; onDeleted: () => void }) {
  const { status } = useHubModels();
  const running = status?.downloads.find((d) => d.file === file && !d.error);
  if (running) return <HubDownloadPage file={file} received={running.received} total={running.total} onClosed={onDeleted} />;
  return <HubInstalledPage file={file} onDeleted={onDeleted} />;
}

//same layout as the on-device download sheet
function HubDownloadPage({
  file,
  received,
  total,
  onClosed,
}: {
  file: string;
  received: number;
  total: number;
  onClosed: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { catalog } = useHubModels();
  const [error, setError] = useState<string | null>(null);
  //speed from the gap between two polls, smoothed
  const last = useRef({ received, time: Date.now() });
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const seconds = (now - last.current.time) / 1000;
    if (seconds > 0.5 && received >= last.current.received) {
      const instant = (received - last.current.received) / seconds;
      setSpeed((previous) => (previous ? previous * 0.6 + instant * 0.4 : instant));
      last.current = { received, time: now };
    }
  }, [received]);

  const cancel = async () => {
    setError(null);
    try {
      await runHubModels((models) => models.cancel(file));
      onClosed();
    } catch (e) {
      setError(t("hubModels.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const starting = t("download.starting");
  const eta = speed > 0 && total ? Math.round((total - received) / speed) : 0;
  return (
    <View style={styles.sheetCard}>
      <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
        {t("settings.litert.downloadingModel", { name: hubModelName(file, catalog) })}
      </Text>
      {!!error && <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{error}</Text>}
      <Group style={{ marginBottom: Spacing.lg2 }}>
        <ProgressBar progress={total ? received / total : 0} icon={downloadIcon} />
        <ActionButton
          label={t("settings.litert.downloaded")}
          rightElement={
            <Text style={styles.rowMeta}>{total ? `${formatBytes(received)} / ${formatBytes(total)}` : starting}</Text>
          }
        />
        <ActionButton
          label={t("settings.litert.speed")}
          rightElement={<Text style={styles.rowMeta}>{speed ? `${formatBytes(speed)}/s` : starting}</Text>}
        />
        <ActionButton
          label={t("settings.litert.timeLeft")}
          rightElement={<Text style={styles.rowMeta}>{eta ? `${eta}s` : starting}</Text>}
        />
      </Group>
      <Group>
        <ActionButton icon={cancelIcon} label={t("settings.litert.cancelDownload")} onPress={cancel} />
      </Group>
    </View>
  );
}

//one installed model, opened from the grid
function HubInstalledPage({ file, onDeleted }: { file: string; onDeleted: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { status, catalog } = useHubModels();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = hubModelName(file, catalog);
  const model = status?.installed.find((m) => m.file === file);
  const repo = model?.repo ?? catalog.find((m) => m.file === file)?.repo;
  const [description, setDescription] = useState<{ repo: string; text: string | null } | null>(null);

  useEffect(() => {
    if (!repo) return;
    let dropped = false;
    fetchModelDescription(repo).then((text) => !dropped && setDescription({ repo, text }));
    return () => {
      dropped = true;
    };
  }, [repo]);

  const remove = async () => {
    setConfirmDelete(false);
    setBusy(true);
    setError(null);
    try {
      await runHubModels((models) => models.remove(file));
      onDeleted();
    } catch (e) {
      setError(t("hubModels.failed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.sheetCard}>
        <View style={styles.detailHeader}>
          <View style={styles.detailTile}>
            <Image source={{ uri: hubModelAvatar(name, repo) }} style={styles.tileImage} />
          </View>
          <View style={styles.detailInfo}>
            <Text style={styles.detailName}>{name}</Text>
            {!!hubModelPublisher(name) && (
              <Text style={styles.detailMeta}>{hubModelPublisher(name)!.publisher}</Text>
            )}
            {!!model && <Text style={styles.detailMeta}>{formatBytes(model.size)}</Text>}
            <Text style={styles.detailMeta}>{file}</Text>
          </View>
        </View>

        {!!repo && (
          <>
            <Text style={[styles.settingLabel, styles.detailSection]}>{t("settings.litert.description")}</Text>
            <Text style={styles.helpText}>
              {description?.repo !== repo
                ? t("settings.litert.loading")
                : (description.text ?? t("settings.litert.noDescription"))}
            </Text>
          </>
        )}
      </View>

      {/* actions section */}
      <View style={styles.sheetCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          {!!error && <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{error}</Text>}
          <Group>
            <ActionButton
              icon={binIcon}
              label={t("settings.litert.deleteModel")}
              disabled={busy}
              onPress={() => setConfirmDelete(true)}
            />
          </Group>
        </View>
      </View>

      <NotificationModal
        visible={confirmDelete}
        title={t("hubModels.deleteTitle", { name })}
        message={t("hubModels.deleteMessage")}
        onClose={() => setConfirmDelete(false)}
        buttons={[
          { text: t("common.cancel"), style: "secondary", onPress: () => setConfirmDelete(false) },
          { text: t("hubModels.delete"), style: "danger", onPress: remove },
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
    sheetCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
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
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
    detailHeader: {
      flexDirection: "row",
      gap: Spacing.lg2,
    },
    detailTile: {
      width: 120,
      height: 120,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      overflow: "hidden",
    },
    tileImage: {
      width: "100%",
      height: "100%",
    },
    detailInfo: {
      flex: 1,
    },
    detailName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.lg,
      color: Colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    detailMeta: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      lineHeight: 20,
    },
    rowMeta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.micro,
      color: Colors.textMuted,
    },
    detailSection: {
      marginTop: Spacing.xxl,
    },
  });
