import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { leaveGame } from "../services/game";
import { stopTracking } from "../services/location";
import { Body, Button } from "./components";
import { confirmAction } from "./confirm";
import { useGame } from "./GameProvider";
import { colors, space } from "./theme";

/**
 * Hunt-code en teamnaam in beeld en afmelden op deze telefoon, ook midden in
 * het spel. Daarmee kan het team later (of op een andere telefoon) verder.
 */
export function LeaveGame({ showCode = true }: { showCode?: boolean }) {
  const { snapshot, t } = useGame();
  if (!snapshot) return null;
  const code = snapshot.session.joinCode ?? snapshot.team.teamCode;
  const name = snapshot.team.name;

  const confirm = () => {
    const unsent = snapshot.pending > 0 ? `\n\n${t("leaveUnsent", { count: snapshot.pending })}` : "";
    confirmAction(t("leave"), t("leaveConfirmCode", { code, name }) + unsent, t("yes"), t("no"), async () => {
      await stopTracking().catch(() => undefined);
      await leaveGame();
      router.replace("/");
    });
  };

  return (
    <View style={styles.box}>
      {showCode ? (
        <>
          <Body muted>{t("yourTeamCode")}</Body>
          <Text style={styles.code}>{code}</Text>
          <Text style={styles.code}>{name}</Text>
        </>
      ) : null}
      <Button kind="secondary" label={t("leave")} onPress={confirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: space.lg, gap: space.sm },
  code: { color: colors.text, fontSize: 22, fontWeight: "700", letterSpacing: 3 },
});
