import { t as tx, type GamePackage } from "@hunt/engine";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { MessageKey } from "../core/i18n";
import { Body, Button, Title } from "./components";
import { space } from "./theme";

/**
 * Speluitleg vóór een centrale start: de schermen één voor één, met vorige en
 * volgende. Na het laatste scherm meldt het team zich klaar.
 */
export function Briefing({
  game,
  lang,
  tasks,
  t,
  busy,
  onDone,
}: {
  game: GamePackage;
  lang: string;
  tasks: string[];
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  busy?: boolean;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const task = game.tasks.find((x) => x.id === tasks[index]);
  const last = index === tasks.length - 1;
  const tr = (text: Parameters<typeof tx>[0]) => tx(text, lang, game.defaultLanguage);

  return (
    <View style={styles.wrap}>
      <Body muted>
        {t("briefingTitle")} · {t("briefingProgress", { n: index + 1, total: tasks.length })}
      </Body>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {task ? (
          <>
            <Title>{tr(task.title)}</Title>
            {task.body ? <Body>{tr(task.body)}</Body> : null}
          </>
        ) : null}
      </ScrollView>
      <View style={styles.buttons}>
        {index > 0 ? (
          <View style={styles.button}>
            <Button kind="secondary" label={t("briefingBack")} onPress={() => setIndex(index - 1)} />
          </View>
        ) : null}
        <View style={styles.button}>
          {last ? (
            <Button label={t("briefingDone")} busy={busy} onPress={onDone} />
          ) : (
            <Button label={t("briefingNext")} onPress={() => setIndex(index + 1)} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: space.md },
  scroll: { flex: 1 },
  content: { gap: space.md, paddingBottom: space.lg },
  buttons: { flexDirection: "row", gap: space.md },
  button: { flex: 1 },
});
