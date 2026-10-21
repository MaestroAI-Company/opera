import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { mcpAvatar, mcpSourceLabel, runHubMcp, useHubMcp } from "../../hooks/useHubMcp";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { formatBytes } from "../../services/ai/providers/huggingFaceCatalog";
import { HostedMcpServer, McpField } from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import CardGrid from "../ui/CardGrid";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import TextInputField from "../ui/TextInputField";
import Toggle from "../ui/Toggle";

const addIcon = require("../../../assets/icons/add.png");
const binIcon = require("../../../assets/icons/bin.png");
const fileIcon = require("../../../assets/icons/file.png");
const keyIcon = require("../../../assets/icons/key.png");
const pencilIcon = require("../../../assets/icons/pencil.png");
const reconnectIcon = require("../../../assets/icons/reconnect.png");
const downloadIcon = require("../../../assets/icons/download.png");
const toolIcon = require("../../../assets/icons/tool.png");

//lines of the log shown on the page
const LOG_LINES = 20;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

//state words shared by the grid and the server page
export function useMcpStateLabel() {
  const t = useT();
  return (server: HostedMcpServer) => {
    if (server.state === "running") {
      if (server.update) return t("hubMcp.state.update", { version: server.update });
      const running = t("hubMcp.state.running", { count: server.tools.length });
      return server.usage ? `${running} · ${formatBytes(server.usage.memory)}` : running;
    }
    return t(`hubMcp.state.${server.state}`);
  };
}

type FieldRowsProps = {
  fields: McpField[];
  drafts: Record<string, string>;
  secretsSet?: string[];
  onChange: (key: string, value: string) => void;
  onPickFolder: (key: string) => void;
};

//one row per setting, borderless controls in groups
export function McpFieldRows({ fields, drafts, secretsSet = [], onChange, onPickFolder }: FieldRowsProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  return (
    <>
      {fields.map((field, index) => {
        const last = index === fields.length - 1;
        const value = drafts[field.key] ?? "";
        //the hub machine reads secrets to run the server
        const help = [
          field.description,
          field.required ? t("hubMcp.required") : "",
          field.secret ? t("hubMcp.secretOnHub") : "",
        ]
          .filter(Boolean)
          .join(" ");
        if (field.kind === "boolean") {
          return (
            <View key={field.key} style={[styles.settingRowVertical, last && { marginBottom: 0 }]}>
              <View style={styles.toggleGroupRow}>
                <View style={styles.toggleGroupContent}>
                  <Text style={styles.settingLabel}>{field.label}</Text>
                  {!!help && <Text style={styles.helpText}>{help}</Text>}
                </View>
                <Toggle
                  checked={(value || field.default) === "true"}
                  onToggle={(on) => onChange(field.key, on ? "true" : "false")}
                />
              </View>
            </View>
          );
        }
        return (
          <View key={field.key} style={[styles.settingRowVertical, last && { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>{field.label}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {field.secret && secretsSet.includes(field.key) ? `${t("hubMcp.secretSet")} ${t("hubMcp.secretOnHub")}` : help}
            </Text>
            <Group>
              {field.kind === "folder" || field.kind === "file" ? (
                <ActionButton
                  icon={fileIcon}
                  label={value || t("hubMcp.chooseFolder")}
                  onPress={() => onPickFolder(field.key)}
                />
              ) : (
                <TextInputField
                  icon={field.secret ? keyIcon : pencilIcon}
                  placeholder={field.default ?? ""}
                  value={value}
                  onChangeText={(text) => onChange(field.key, text)}
                  secureTextEntry={field.secret}
                  keyboardType={field.kind === "number" ? "numeric" : "default"}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            </Group>
          </View>
        );
      })}
    </>
  );
}

type HubMcpSectionProps = {
  onAddServer: () => void;
  onOpenServer: (id: string, title: string) => void;
};

//mcp servers the sampler runs, admins only
export default function HubMcpSection({ onAddServer, onOpenServer }: HubMcpSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const stateLabel = useMcpStateLabel();
  const { api, status, error } = useHubMcp();
  const servers = status?.servers ?? [];

  const help = error
    ? t("hubMcp.failed", { error: message(error) })
    : !status
      ? t("hubMcp.loading")
      : t(status.isolation === "full" ? "hubMcp.helpFull" : "hubMcp.helpPartial");

  return (
    <View style={styles.contentCard}>
      <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
        <Text style={styles.settingLabel}>{t("hubMcp.title")}</Text>
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{help}</Text>

        <Group style={[styles.highlightGroup, !api && styles.highlightGroupDisabled]}>
          <ActionButton
            icon={addIcon}
            label={t("hubMcp.add")}
            variant="highlight"
            disabled={!api}
            onPress={onAddServer}
          />
        </Group>

        {servers.length > 0 && (
          <CardGrid
            style={{ marginTop: Spacing.md }}
            cards={servers.map((server) => ({
              key: server.id,
              title: server.listing.title,
              status: stateLabel(server),
              error: server.state === "failed",
              onPress: () => onOpenServer(server.id, server.listing.title),
            }))}
          />
        )}
      </View>
    </View>
  );
}

type HubMcpServerPageProps = {
  id: string;
  onRemoved: () => void;
  onPickFolder: (current: string | undefined, done: (path: string) => void) => void;
};

//one hosted server, settings and actions
export function HubMcpServerPage({ id, onRemoved, onPickFolder }: HubMcpServerPageProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();
  const stateLabel = useMcpStateLabel();
  const { status } = useHubMcp();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const server = status?.servers.find((s) => s.id === id);
  //values reset when another server opens
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    setDrafts({});
    setLogs(null);
    setError(null);
  }
  if (!server) return null;

  const listing = server.listing;
  const avatar = mcpAvatar(listing);
  const shown = { ...server.values, ...drafts };
  const changed = Object.keys(drafts).length > 0;
  const folders = listing.fields
    .filter((f) => f.kind === "folder" || f.kind === "file")
    .map((f) => server.values[f.key])
    .filter(Boolean);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t("hubMcp.failed", { error: message(e) }));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(async () => {
      await runHubMcp((api) => api.configure(id, drafts));
      setDrafts({});
    });

  const showLogs = () => act(async () => setLogs(await runHubMcp((api) => api.logs(id))));

  const accessRows = [
    ...(server.usage
      ? [
          { label: t("hubMcp.cpu"), value: t("hubMcp.cpuValue", { value: Math.round(server.usage.cpu) }) },
          { label: t("hubMcp.memory"), value: formatBytes(server.usage.memory) },
        ]
      : []),
    { label: t("hubMcp.isolation"), value: t(status?.isolation === "full" ? "hubMcp.isolationFull" : "hubMcp.isolationPartial") },
    { label: t("hubMcp.network"), value: t("hubMcp.networkOpen") },
    { label: t("hubMcp.folders"), value: folders.length > 0 ? folders.join(", ") : t("hubMcp.noFolders") },
    { label: t("hubMcp.license"), value: listing.license ?? t("hubMcp.unknown") },
  ];

  return (
    <>
      {/* detail header */}
      <View style={styles.contentCard}>
        <View style={styles.detailHeader}>
          <View style={styles.detailTile}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.tileImage} />
            ) : (
              <Image source={toolIcon} style={styles.tileIcon} tintColor={Colors.textPrimary} />
            )}
          </View>
          <View style={styles.detailInfo}>
            <Text style={styles.detailName}>{listing.title}</Text>
            <Text style={styles.detailMeta}>{listing.publisher}</Text>
            <Text style={styles.detailMeta}>{mcpSourceLabel(listing)}</Text>
            <Text style={[styles.detailMeta, server.state === "failed" && { color: Colors.error }]}>
              {stateLabel(server)}
            </Text>
          </View>
        </View>
        {(!!server.message || !!error) && (
          <Text style={[styles.helpText, styles.detailSection, { color: Colors.error }]}>
            {error ?? server.message}
          </Text>
        )}
        {!!listing.description && (
          <Text style={[styles.helpText, styles.detailSection]}>{listing.description}</Text>
        )}
      </View>

      {/* settings, saved together */}
      {listing.fields.length > 0 && (
        <View style={styles.contentCard}>
          <McpFieldRows
            fields={listing.fields}
            drafts={shown}
            secretsSet={server.secrets_set}
            onChange={(key, value) => setDrafts((prev) => ({ ...prev, [key]: value }))}
            onPickFolder={(key) =>
              onPickFolder(shown[key], (path) => setDrafts((prev) => ({ ...prev, [key]: path })))
            }
          />
          <Group
            style={[
              styles.highlightGroup,
              styles.detailSection,
              (!changed || busy) && styles.highlightGroupDisabled,
            ]}
          >
            <ActionButton
              icon={pencilIcon}
              label={t("hubMcp.save")}
              variant="highlight"
              disabled={!changed || busy || server.state === "installing"}
              onPress={save}
            />
          </Group>
        </View>
      )}

      {/* on or off */}
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <View style={styles.toggleGroupRow}>
            <View style={styles.toggleGroupContent}>
              <Text style={styles.settingLabel}>{t("hubMcp.enabled")}</Text>
              <Text style={styles.helpText}>{t("hubMcp.enabledHelp")}</Text>
            </View>
            <Toggle
              checked={server.enabled}
              onToggle={(on) => act(() => runHubMcp((api) => api.enable(id, on)))}
            />
          </View>
        </View>
      </View>

      {/* tools maestro gets */}
      {server.tools.length > 0 && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>{t("hubMcp.tools")}</Text>
            <Group style={styles.infoGroup}>
              {server.tools.map((tool) => (
                <ActionButton key={tool} icon={toolIcon} label={tool} />
              ))}
            </Group>
          </View>
        </View>
      )}

      {/* what the sandbox lets through */}
      <View style={styles.contentCard}>
        <Group style={styles.infoGroup}>
          {accessRows.map((row) => (
            <ActionButton
              key={row.label}
              label={row.label}
              rightElement={
                <Text style={styles.infoValue} numberOfLines={2}>
                  {row.value}
                </Text>
              }
            />
          ))}
        </Group>
      </View>

      {/* last lines the server wrote */}
      {logs && (
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>{t("hubMcp.log")}</Text>
            <Text style={styles.codeBlock} selectable>
              {logs.length > 0 ? logs.slice(-LOG_LINES).join("\n") : t("hubMcp.logEmpty")}
            </Text>
          </View>
        </View>
      )}

      {/* actions section */}
      <View style={styles.contentCard}>
        <Group>
          {!!server.update && (
            <ActionButton
              icon={downloadIcon}
              label={t("hubMcp.updateTo", { version: server.update })}
              disabled={busy}
              onPress={() => act(() => runHubMcp((api) => api.update(id)))}
            />
          )}
          <ActionButton
            icon={reconnectIcon}
            label={t("hubMcp.restart")}
            disabled={busy || !server.enabled || server.state === "installing"}
            onPress={() => act(() => runHubMcp((api) => api.restart(id)))}
          />
          <ActionButton icon={fileIcon} label={t("hubMcp.showLog")} disabled={busy} onPress={showLogs} />
          <ActionButton
            icon={binIcon}
            label={t("hubMcp.remove")}
            disabled={busy}
            onPress={() => setConfirmRemove(true)}
          />
        </Group>
      </View>

      <NotificationModal
        visible={confirmRemove}
        title={t("hubMcp.removeTitle", { name: listing.title })}
        message={t("hubMcp.removeMessage")}
        onClose={() => setConfirmRemove(false)}
        buttons={[
          { text: t("common.cancel"), style: "secondary", onPress: () => setConfirmRemove(false) },
          {
            text: t("hubMcp.remove"),
            style: "danger",
            onPress: () => {
              setConfirmRemove(false);
              act(async () => {
                await runHubMcp((api) => api.remove(id));
                onRemoved();
              });
            },
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
    toggleGroupRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    toggleGroupContent: {
      flex: 1,
      marginRight: Spacing.lg2,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
    //static rows on the white card
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
      alignItems: "center",
      justifyContent: "center",
    },
    tileImage: {
      width: "100%",
      height: "100%",
    },
    tileIcon: {
      width: 40,
      height: 40,
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
      marginTop: Spacing.lg2,
    },
    codeBlock: {
      backgroundColor: Colors.codeBlockBg,
      color: Colors.codeBlockText,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.code,
      lineHeight: 18,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
    },
  });
