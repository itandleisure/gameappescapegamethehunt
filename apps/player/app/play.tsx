import { trackColor, t as tx } from "@hunt/engine";
import { Redirect, router, useSegments } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatDuration } from "../src/core/i18n";
import { playAreaBounds, taskMarkers } from "../src/core/play-area";
import { isAnswerable, listGroups, mapStyleChoice, taskToShow } from "../src/core/view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MessageKey } from "../src/core/i18n";
import {
  onFix,
  requestLocationPermission,
  startTracking,
  stopTracking,
  type PermissionResult,
} from "../src/services/location";
import { downloadPlayArea } from "../src/services/map-download";
import { Banner, Body, Button, Screen, Title } from "../src/ui/components";
import { takePhoto } from "../src/ui/camera";
import { playSiren } from "../src/services/siren";
import { useGame } from "../src/ui/GameProvider";
import GameMap from "../src/ui/map/GameMap";
import { colors, radius, space } from "../src/ui/theme";

const SIREN_GAP_MS = 8_000;
const MAP_STYLE_KEY = "hunt.kaartstijl";

export default function PlayScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const segments = useSegments();
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [position, setPosition] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [teamPhoto, setTeamPhoto] = useState<string | null>(null);
  // Kaartstijl die het team zelf koos (bewaard op deze telefoon).
  const [chosenStyle, setChosenStyle] = useState<string | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(MAP_STYLE_KEY)
      .then(setChosenStyle)
      .catch(() => undefined);
  }, []);
  const [dismissedMessages, setDismissedMessages] = useState(0);
  const lastShown = useRef<string | undefined>(undefined);
  const lastClosed = useRef(0);
  useKeepAwake();

  const state = snapshot?.state ?? null;
  const game = snapshot?.game;
  const started = state !== null;

  // Kaart van het speelveld op de achtergrond downloaden.
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    setDownload(0);
    downloadPlayArea(
      snapshot.session.id,
      snapshot.game,
      (p) => !cancelled && setDownload(p),
    )
      .catch(() => undefined)
      .finally(() => !cancelled && setDownload(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.session.id]);

  // GPS loopt zolang het spel loopt.
  useEffect(() => {
    if (!started || state?.ended) return;
    void startTracking(t("appName"), t("backgroundNotice")).then(setPermission);
    return onFix((fix) =>
      setPosition({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, state?.ended !== undefined]);

  useEffect(() => {
    if (state?.ended) void stopTracking();
  }, [state?.ended]);

  // Een opdracht die opengaat (op locatie, uit een reeks of door de spelleiding) komt vanzelf in beeld.
  const toShow = game && state ? taskToShow(game, state) : undefined;
  const onTaskScreen = segments[0] === "task";
  useEffect(() => {
    if (!toShow || onTaskScreen || toShow === lastShown.current) return;
    lastShown.current = toShow;
    // Sirene bij een popup, maar niet bij elk volgend scherm van een reeks
    // (zoals de speluitleg): die volgen binnen een paar seconden op elkaar.
    if (Date.now() - lastClosed.current > SIREN_GAP_MS) void playSiren();
    router.push({ pathname: "/task/[id]", params: { id: toShow } });
  }, [toShow, onTaskScreen]);
  const wasOnTask = useRef(false);
  useEffect(() => {
    if (wasOnTask.current && !onTaskScreen) lastClosed.current = Date.now();
    wasOnTask.current = onTaskScreen;
  }, [onTaskScreen]);

  // Nieuw bericht van de spelleiding of uit een regel: ook de sirene.
  const messageCount = state?.messages.length ?? 0;
  const seenMessages = useRef<number | null>(null);
  useEffect(() => {
    if (seenMessages.current !== null && messageCount > seenMessages.current) void playSiren();
    seenMessages.current = messageCount;
  }, [messageCount]);

  const bounds = useMemo(
    () => (game ? playAreaBounds(game) : undefined),
    [game],
  );
  // Foto's bij opdrachten vooraf ophalen, zodat ze er ook zijn bij slecht bereik.
  useEffect(() => {
    for (const task of game?.tasks ?? []) {
      for (const uri of [task.image, ...task.hints.map((h) => h.image)])
        if (uri) void Image.prefetch(uri).catch(() => undefined);
    }
    for (const p of game?.playgrounds ?? [])
      if (p.reveal) void Image.prefetch(p.reveal.image).catch(() => undefined);
  }, [game]);

  if (!controller || !snapshot || !game) return <Redirect href="/" />;
  if (state?.ended) return <Redirect href="/end" />;

  if (!started) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Title>{tx(game.name, lang, game.defaultLanguage)}</Title>
          <Body muted>{t("yourTeamCode")}</Body>
          <Text style={styles.teamCode}>{snapshot.team.teamCode}</Text>
          <Body muted>{t("teamCodeExplain")}</Body>
          <View style={styles.spacer} />
          <Body>{t("locationNeeded")}</Body>
          <Body muted>{t("locationAlways")}</Body>
          {permission === "denied" ? (
            <>
              <Banner tone="danger">{t("locationDenied")}</Banner>
              <Button
                kind="secondary"
                label={t("openSettings")}
                onPress={() => void Linking.openSettings()}
              />
            </>
          ) : null}
          {snapshot.teamPhotoNeeded || teamPhoto ? (
            <>
              <View style={styles.spacer} />
              <Title>{t("teamPhotoTitle")}</Title>
              {teamPhoto ? (
                <>
                  <Image source={{ uri: teamPhoto }} style={styles.teamPhoto} />
                  <Body muted>{t("teamPhotoDone")}</Body>
                </>
              ) : (
                <>
                  <Body>{t("teamPhotoExplain")}</Body>
                  <Button
                    kind="secondary"
                    label={t("takeTeamPhoto")}
                    onPress={async () => {
                      const uri = await takePhoto();
                      if (!uri) return;
                      await controller.submitTeamPhoto(uri);
                      setTeamPhoto(uri);
                    }}
                  />
                </>
              )}
            </>
          ) : null}
          <View style={styles.spacer} />
          <Body muted>{t("startExplain")}</Body>
          <Button
            label={t("start")}
            disabled={snapshot.teamPhotoNeeded}
            busy={starting}
            onPress={async () => {
              setStarting(true);
              try {
                const result = await requestLocationPermission();
                setPermission(result);
                if (result !== "denied") await controller.start();
              } finally {
                setStarting(false);
              }
            }}
          />
        </Screen>
      </SafeAreaView>
    );
  }

  const ctx = controller.context!;
  const visibleOnMap = Object.entries(state.tasks)
    .filter(([, ts]) => ts.onMap && ts.status === "visible")
    .map(([id]) => id);
  const markers = taskMarkers(game, ctx.track, visibleOnMap);
  const listCount = listGroups(game, state)
    .flatMap((g) => g.tasks)
    .filter((task) => isAnswerable(game, ctx, state, task.id)).length;
  const latestMessage =
    state.messages.length > dismissedMessages
      ? state.messages[state.messages.length - 1]
      : undefined;
  const overlay = game.mapOverlay;
  // In een testsessie kun je opdrachten openen zonder ter plekke te zijn.
  const testTargets = snapshot.session.testMode ? controller.testTargets() : [];
  const style = mapStyleChoice(game, chosenStyle);
  const weakGps = position !== null && position.accuracy > game.gps.maxAccuracy;

  return (
    <View style={styles.safe}>
      <GameMap
        styleUrl={style.url}
        bounds={bounds}
        position={position}
        markers={markers.map((m) => ({
          id: m.id,
          lat: m.location.lat,
          lng: m.location.lng,
          label: tx(
            game.tasks.find((x) => x.id === m.id)?.title,
            lang,
            game.defaultLanguage,
          ),
          ...(game.tasks.find((x) => x.id === m.id)?.mapIcon === "logo"
            ? { logoColor: trackColor(ctx.track) }
            : {}),
          ...(game.tasks.find((x) => x.id === m.id)?.mapLabel
            ? { badge: game.tasks.find((x) => x.id === m.id)!.mapLabel }
            : {}),
        }))}
        overlay={
          overlay && /^https?:/.test(overlay.image)
            ? {
                url: overlay.image,
                nw: overlay.bounds[0],
                se: overlay.bounds[1],
              }
            : undefined
        }
      />

      <SafeAreaView edges={["top"]} style={styles.top}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>{t("score")}</Text>
            <Text style={styles.headerValue}>{state.score}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.styleButton}
            onPress={() => {
              setChosenStyle(style.next);
              void AsyncStorage.setItem(MAP_STYLE_KEY, style.next).catch(() => undefined);
            }}
          >
            <Text style={styles.headerLabel}>{t("mapStyle")}</Text>
            <Text style={styles.styleName}>{t(`style_${style.id}` as MessageKey)} ›</Text>
          </Pressable>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>{t("time")}</Text>
            <Text style={styles.headerValue}>
              {formatDuration(snapshot.now - ctx.startedAt)}
            </Text>
          </View>
        </View>
        {!snapshot.online ? (
          <Banner tone="warning">{t("offline")}</Banner>
        ) : null}
        {weakGps ? <Banner tone="warning">{t("gpsWeak")}</Banner> : null}
        {permission === "denied" ? (
          <Banner tone="danger">{t("locationDenied")}</Banner>
        ) : null}
        {download !== null && download < 100 ? (
          <Banner>{t("mapDownloading", { percent: download })}</Banner>
        ) : null}
        {toShow ? (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/task/[id]", params: { id: toShow } })
            }
          >
            <Banner tone="warning">
              {tx(
                game.tasks.find((x) => x.id === toShow)?.title,
                lang,
                game.defaultLanguage,
              )}{" "}
              ›
            </Banner>
          </Pressable>
        ) : null}
        {latestMessage ? (
          <Pressable
            onPress={() => setDismissedMessages(state.messages.length)}
          >
            <Banner tone="success">
              {tx(latestMessage.text, lang, game.defaultLanguage)}
            </Banner>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} style={styles.bottom}>
        {snapshot.session.testMode ? (
          <View style={styles.test}>
            <Banner>{t("testMode")}</Banner>
            <View style={styles.skipRow}>
              {[1, 5, 10].map((minutes) => (
                <View key={minutes} style={styles.skipButton}>
                  <Button
                    kind="secondary"
                    label={`⏩ +${minutes} min`}
                    onPress={() => void controller.skipTime(minutes)}
                  />
                </View>
              ))}
            </View>
            {testTargets.map((id) => (
              <Button
                key={id}
                kind="secondary"
                label={`📍 ${tx(game.tasks.find((x) => x.id === id)?.title, lang, game.defaultLanguage)}`}
                onPress={() => void controller.simulateArrival(id)}
              />
            ))}
          </View>
        ) : null}
        <Button
          label={listCount > 0 ? `${t("tasks")} (${listCount})` : t("tasks")}
          onPress={() => router.push("/tasks")}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  spacer: { height: space.lg },
  test: { marginBottom: space.sm },
  skipRow: { flexDirection: "row", gap: space.sm },
  skipButton: { flex: 1 },
  teamPhoto: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, marginVertical: space.sm },
  teamCode: {
    color: colors.accent,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 6,
    marginVertical: space.sm,
  },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(16,18,20,0.88)",
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  headerRight: { alignItems: "flex-end" },
  styleButton: { alignItems: "center", paddingHorizontal: space.sm },
  styleName: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  headerLabel: { color: colors.textMuted, fontSize: 13 },
  headerValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
});
