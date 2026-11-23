import { Redirect, router } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Title } from "../src/ui/components";
import { useGame } from "../src/ui/GameProvider";
import { NewsCard } from "../src/ui/NewsCard";
import { colors, contentColumn, space } from "../src/ui/theme";

/** Alle nieuwsflitsen van deze hunt, nieuwste bovenaan: om een gemiste flits terug te lezen. */
export default function NewsScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const unread = snapshot?.newsUnread ?? 0;

  // Wat hier in beeld komt, is gelezen.
  useEffect(() => {
    if (unread > 0) void controller?.markNewsRead();
  }, [controller, unread]);

  if (!controller || !snapshot) return <Redirect href="/" />;
  const time = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", timeZone: snapshot.session.timezone });
  const news = [...snapshot.news].reverse();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Title>{`📣 ${t("newsTitle")}`}</Title>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("close")} style={styles.close} onPress={() => router.back()}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.list}>
        {news.length === 0 ? <Body muted>{t("newsEmpty")}</Body> : null}
        {news.map((n) => (
          <NewsCard key={n.id} flash={n} game={snapshot.game} lang={lang} t={t} time={time.format(new Date(n.at))} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.sm,
    ...contentColumn,
  },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.text, fontSize: 22, fontWeight: "700" },
  list: { padding: space.md, gap: space.sm, ...contentColumn },
});
