import { useEffect, useState } from "react";
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
import { fetchModelDescription, formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import ActionButton from "../ui/ActionButton";
import CardGrid, { type GridCard } from "../ui/CardGrid";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";

const addIcon = require("../../../assets/icons/add.png");
const binIcon = require("../../../assets/icons/bin.png");

type HubModelsSectionProps = {
  onAddModel: () => void;
  onOpenModel: (file: string, name: string) => void;
  //off where another action is the main one
  highlight?: boolean;
};

//llama.cpp models the hub runs, admins only
export default function HubModelsSection({ onAddModel, onOpenModel, highlight = true }: HubModelsSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { api, status, catalog, error } = useHubModels();
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelFile, setCancelFile] = useState<string | null>(null);

  const message = (e: unknown) => t("hubModels.failed", { error: e instanceof Error ? e.message : String(e) });

  const cancel = async () => {
    const file = cancelFile;
    setCancelFile(null);
    if (!file) return;
    setActionError(null);
    try {
      await runHubModels((models) => models.cancel(file));
    } catch (e) {
      setActionError(message(e));
    }
  };

  const nameOf = (file: string) => hubModelName(file, catalog);
  const cards: GridCard[] = [
    ...(status?.downloads ?? []).map((d) => ({
      key: `download-${d.file}`,
      title: nameOf(d.file),
      error: !!d.error,
      status: d.error
        ? t("hubModels.downloadFailed")
        : t("hubModels.downloading", { percent: d.total ? Math.floor((d.received / d.total) * 100) : 0 }),
      onPress: () => setCancelFile(d.file),
    })),
    ...(status?.installed ?? []).map((m) => ({
      key: m.file,
      title: nameOf(m.file),
      status: formatBytes(m.size),
      onPress: () => onOpenModel(m.file, nameOf(m.file)),
    })),
  ];

  const runtime = error
    ? message(error)
    : !status
      ? t("hubModels.loading")
      : status.state === "running"
        ? t(status.channel === "nightly" ? "hubModels.runningNightly" : "hubModels.running", {
            backend: (status.backend ?? "cpu").toUpperCase(),
          })
        : status.state === "installing"
          ? t("hubModels.installing")
          : status.state === "failed"
            ? t("hubModels.startFailed", { error: status.message ?? "" })
            : t("hubModels.idle");

  return (
    <>
      {/* runtime and models on the hub */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("hubModels.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{actionError ?? runtime}</Text>

          <Group style={[highlight && styles.highlightGroup, !api && styles.highlightGroupDisabled]}>
            <ActionButton
              icon={addIcon}
              label={t("settings.litert.addModel")}
              variant={highlight ? "highlight" : "default"}
              disabled={!api}
              onPress={onAddModel}
            />
          </Group>

          {cards.length > 0 && <CardGrid cards={cards} style={{ marginTop: Spacing.md }} />}
        </View>
      </View>

      <NotificationModal
        visible={!!cancelFile}
        title={t("hubModels.cancelTitle", { name: cancelFile ? nameOf(cancelFile) : "" })}
        message={t("hubModels.cancelMessage")}
        onClose={() => setCancelFile(null)}
        buttons={[
          { text: t("common.cancel"), style: "secondary", onPress: () => setCancelFile(null) },
          { text: t("hubModels.cancel"), style: "danger", onPress: cancel },
        ]}
      />
    </>
  );
}

//one installed model, opened from the grid
export function HubModelPage({ file, onDeleted }: { file: string; onDeleted: () => void }) {
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
      <View style={styles.contentCard}>
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
      <View style={[styles.contentCard, { marginBottom: 0 }]}>
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
    detailSection: {
      marginTop: Spacing.xxl,
    },
  });
