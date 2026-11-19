import { codeView, hiddenPieces, t as tx } from "@hunt/engine";
import { Redirect, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isAnswerable, listGroups } from "../src/core/view";
import { Body, Button, Title } from "../src/ui/components";
import { LeaveGame } from "../src/ui/LeaveGame";
import { CodeBoxes } from "../src/ui/CodeBoxes";
import { RevealImage } from "../src/ui/RevealImage";
import { useGame } from "../src/ui/GameProvider";
import { colors, radius, space, contentColumn } from "../src/ui/theme";

/** Opdrachten in de lijst en op de playgrounds (zoals het extractiepunt). */
export default function TasksScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const state = snapshot?.state;
  const game = snapshot?.game;
  if (!controller || !state || !game) return <Redirect href="/play" />;
  const ctx = controller.context!;
  const tr = (value: Parameters<typeof tx>[0]) =>
    tx(value, lang, game.defaultLanguage);
  const groups = listGroups(game, state);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("tasks")}</Title>
        {groups.length === 0 ? <Body muted>{t("noTasks")}</Body> : null}
        {groups.map((group) => {
          const pg = game.playgrounds.find((p) => p.id === group.playground);
          const code = pg ? codeView(game, state, pg.id) : null;
          return (
            <View key={group.playground ?? "lijst"} style={styles.group}>
              {pg ? <Text style={styles.groupTitle}>{tr(pg.name)}</Text> : null}
              {pg?.reveal ? (
                <RevealImage
                  reveal={pg.reveal}
                  hidden={hiddenPieces(game, state, pg.id)}
                />
              ) : null}
              {code ? (
                <CodeBoxes
                  view={code}
                  hintText={code.hint?.open ? tr(code.hint.text) : undefined}
                />
              ) : null}
              {group.tasks.map((task) => {
                const ts = state.tasks[task.id]!;
                const open = isAnswerable(game, ctx, state, task.id);
                return (
                  <Pressable
                    key={task.id}
                    style={[styles.row, !open && styles.rowDone]}
                    onPress={() =>
                      router.push({
                        pathname: "/task/[id]",
                        params: { id: task.id },
                      })
                    }
                  >
                    <Text style={styles.rowTitle}>{tr(task.title)}</Text>
                    <Text style={styles.rowStatus}>
                      {ts.status === "done"
                        ? ts.correct
                          ? "✓"
                          : "✗"
                        : open
                          ? "›"
                          : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
        <Button
          kind="secondary"
          label={t("map")}
          onPress={() => router.back()}
        />
        <LeaveGame />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl, ...contentColumn },
  group: { marginBottom: space.lg },
  groupTitle: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: space.sm,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.sm,
  },
  rowDone: { opacity: 0.55 },
  rowTitle: { color: colors.text, fontSize: 17, flex: 1 },
  rowStatus: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: "700",
    marginLeft: space.sm,
  },
});
