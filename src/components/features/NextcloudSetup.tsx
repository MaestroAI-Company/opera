import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { FontSizes, Fonts, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { loadNextcloudConfig, runNextcloudLoginFlow } from "../../services/cloud/NextcloudProvider";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import TextInputField from "../ui/TextInputField";

const linkIcon = require("../../../assets/icons/link.png");
const cloudIcon = require("../../../assets/icons/cloud.png");
const cancelIcon = require("../../../assets/icons/cancel.png");

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

  //closing the sheet stops a pending login
  useEffect(() => () => {
    cancelledRef.current = true;
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

  const canConnect = !!serverUrl.trim();

  //rows of a settings card, the parent draws the card
  return (
    <>
      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>{t("settings.server.link")}</Text>
        <Text style={[styles.helpText, !isBrowser && styles.helpTextSpaced]}>
          {t("nextcloud.help")}
        </Text>
        {isBrowser && (
          <Text style={[styles.helpText, styles.errorText, styles.helpTextSpaced]}>
            {t("nextcloud.cors")}
          </Text>
        )}
        <Group>
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
      </View>

      <View>
        {connecting ? (
          <Group>
            <ActionButton icon={cancelIcon} label={t("common.cancel")} onPress={handleCancel} />
          </Group>
        ) : (
          <Group style={[styles.highlightGroup, !canConnect && styles.highlightGroupDisabled]}>
            <ActionButton
              icon={cloudIcon}
              label={t("nextcloud.connect")}
              variant="highlight"
              disabled={!canConnect}
              onPress={handleConnect}
            />
          </Group>
        )}
        {connecting && <Text style={styles.helpText}>{t("nextcloud.waiting")}</Text>}
        {failed && <Text style={[styles.helpText, styles.errorText]}>{t("nextcloud.failed")}</Text>}
      </View>
    </>
  );
}

//same look as the settings drawer rows
const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
  helpTextSpaced: {
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.error,
  },
  highlightGroup: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
  highlightGroupDisabled: {
    opacity: 0.5,
  },
});
