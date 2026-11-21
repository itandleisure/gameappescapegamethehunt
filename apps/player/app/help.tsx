import { t as tx } from "@hunt/engine";
import { Redirect, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Title } from "../src/ui/components";
import { useGame } from "../src/ui/GameProvider";
import { colors, contentColumn, radius, space } from "../src/ui/theme";

/**
 * Help tijdens het spel: alle schermen van de speluitleg (de reeks "intro"),
 * zodat een team de uitleg op elk moment terug kan kijken.
 */
export default function HelpScreen() {
  const { snapshot, t, lang } = useGame();
  const game = snapshot?.game;
  if (!game) return <Redirect href="/play" />;
  const ids = game.sequences.find((q) => q.id === "intro")?.tasks ?? [];
  const tasks = ids.map((id) => game.tasks.find((x) => x.id === id)).filter((x) => !!x);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("helpTitle")}</Title>
        <Body muted>{t("helpExplain")}</Body>
        {tasks.map((task) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            style={styles.row}
            onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
          >
            <Text style={styles.rowTitle}>{tx(task.title, lang, game.defaultLanguage)}</Text>
            <Text style={styles.rowStatus}>›</Text>
          </Pressable>
        ))}
        <Button kind="secondary" label={t("close")} onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl, gap: 12, ...contentColumn },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: space.md,
  },
  rowTitle: { color: colors.text, fontSize: 17, flex: 1 },
  rowStatus: { color: colors.accent, fontSize: 20, fontWeight: "700" },
});
