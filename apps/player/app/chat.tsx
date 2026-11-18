import { Redirect, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CHAT_MAX_LENGTH } from "../src/core/game-controller";
import { Banner, Body, Title } from "../src/ui/components";
import { useGame } from "../src/ui/GameProvider";
import { colors, contentColumn, radius, space } from "../src/ui/theme";

/** Teamchat: één gesprek met alle teams van de hunt en de spelleiding. */
export default function ChatScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const [text, setText] = useState("");
  const scroll = useRef<ScrollViewInstance>(null);
  const chat = snapshot?.chat ?? [];
  const unread = snapshot?.chatUnread ?? 0;

  // Wat hier in beeld komt, is gelezen.
  useEffect(() => {
    if (unread > 0) void controller?.markChatRead();
  }, [controller, unread]);

  // Nieuwste bericht in beeld, ook na het openen (dan is de lijst er al voordat hij een hoogte heeft).
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 100);
    return () => clearTimeout(timer);
  }, [chat.length]);

  if (!controller || !snapshot) return <Redirect href="/" />;
  const open = controller.teamChat;
  const ownTeam = snapshot.team.id;
  const time = new Intl.DateTimeFormat(lang, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: snapshot.session.timezone,
  });

  const send = async () => {
    if (await controller.sendChat(text)) setText("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <View style={styles.flex}>
            <Title>{t("chatTitle")}</Title>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            style={styles.close}
            onPress={() => router.back()}
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          onLayout={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {chat.length === 0 ? <Body muted>{t("chatEmpty")}</Body> : null}
          {chat.map((m) => {
            const own = m.teamId === ownTeam;
            const staff = m.teamId === null;
            return (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  own ? styles.own : styles.other,
                  staff && styles.staff,
                ]}
              >
                <Text style={[styles.name, own && styles.ownName]} numberOfLines={1}>
                  {own ? t("chatYou") : staff ? t("chatStaff") : m.name}
                  {"  "}
                  <Text style={[styles.time, own && styles.ownTime]}>{time.format(m.createdAt)}</Text>
                </Text>
                <Text style={[styles.body, own && styles.ownBody]}>{m.body}</Text>
                {m.pending ? (
                  <Text style={[styles.time, own && styles.ownTime]}>
                    {t("chatPending")}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        {open ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={t("chatPlaceholder")}
              placeholderTextColor={colors.textMuted}
              maxLength={CHAT_MAX_LENGTH}
              multiline
              accessibilityLabel={t("chatPlaceholder")}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!text.trim()}
              style={[styles.send, !text.trim() && styles.sendOff]}
              onPress={() => void send()}
            >
              <Text style={styles.sendText}>{t("chatSend")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <View style={styles.flex}>
              <Banner>{t("chatClosed")}</Banner>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
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
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: colors.text, fontSize: 22, fontWeight: "700" },
  list: { padding: space.md, gap: space.sm, ...contentColumn },
  bubble: {
    maxWidth: "85%",
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  other: { alignSelf: "flex-start", backgroundColor: colors.surfaceRaised },
  own: { alignSelf: "flex-end", backgroundColor: colors.accent },
  staff: { borderWidth: 2, borderColor: colors.success },
  name: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  ownName: { color: colors.accentText },
  ownTime: { color: colors.accentText, opacity: 0.7 },
  time: { color: colors.textMuted, fontSize: 12, fontWeight: "400" },
  body: { color: colors.text, fontSize: 17, marginTop: 2 },
  ownBody: { color: colors.accentText },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...contentColumn,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 17,
  },
  send: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { opacity: 0.5 },
  sendText: { color: colors.accentText, fontSize: 17, fontWeight: "700" },
});
