import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { loadNextcloudConfig, runNextcloudLoginFlow } from "../../services/cloud/NextcloudProvider";
import Group from "../ui/Group";
import TextInputField from "../ui/TextInputField";
import { pressStyle } from "../ui/pressStyle";

const linkIcon = require("../../../assets/icons/link.png");

type NextcloudSetupProps = {
  onDone: () => void;
};

//nextcloud login flow, the browser grants the app password
export default function NextcloudSetup({ onDone }: NextcloudSetupProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();

  const [serverUrl, setServerUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelledRef = useRef(false);
  const isBrowser = Platform.OS === "web" && !("__TAURI_INTERNALS__" in window);

  useEffect(() => {
    loadNextcloudConfig().then(config => {
      if (config) setServerUrl(config.serverUrl);
    });
  }, []);

  const handleConnect = async () => {
    if (!serverUrl.trim() || connecting) return;
    cancelledRef.current = false;
    setConnecting(true);
    setFailed(false);

    const success = await runNextcloudLoginFlow(serverUrl, () => cancelledRef.current);

    setConnecting(false);
    if (success) {
      onDone();
    } else if (!cancelledRef.current) {
      setFailed(true);
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setConnecting(false);
  };

  return (
    <View style={styles.container}>
      {isBrowser && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Blocked by CORS: a browser refuses to call another domain unless that domain allows it. This needs CORS
            headers on your Nextcloud reverse proxy, otherwise use the desktop or mobile app.
          </Text>
        </View>
      )}

      <Text style={styles.helpText}>
        Enter your server address, then approve the connection in the browser window that opens.
      </Text>

      <Group style={styles.field}>
        <TextInputField
          icon={linkIcon}
          placeholder="cloud.example.com"
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!connecting}
        />
      </Group>

      {connecting ? (
        <>
          <Text style={styles.statusText}>{t("nextcloud.waiting")}</Text>
          <Pressable
            style={pressStyle(styles.cancelBtn, "surface")}
            onPress={handleCancel}
          >
            <Text style={styles.cancelBtnText}>{t("common.cancel")}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          style={pressStyle(
            [styles.connectBtn, !serverUrl.trim() && styles.connectBtnDisabled],
            !!serverUrl.trim() && "primary"
          )}
          onPress={handleConnect}
          disabled={!serverUrl.trim()}
        >
          <Text style={styles.connectBtnText}>{t("nextcloud.connect")}</Text>
        </Pressable>
      )}

      {failed && <Text style={styles.errorText}>{t("nextcloud.failed")}</Text>}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    marginTop: Spacing.lg2,
  },
  warningBox: {
    backgroundColor: Colors.dangerBg,
    borderWidth: 2,
    borderColor: Colors.dangerBorderSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg2,
  },
  warningText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.body,
    color: Colors.error,
  },
  helpText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg2,
  },
  field: {
    marginBottom: Spacing.md,
  },
  statusText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    fontStyle: "italic",
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.body,
    color: Colors.error,
    marginTop: Spacing.md,
  },
  connectBtn: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg2,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xs,
  },
  connectBtnDisabled: {
    opacity: 0.5,
  },
  connectBtnText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textOnPrimary,
  },
  cancelBtn: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg2,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
  },
});
