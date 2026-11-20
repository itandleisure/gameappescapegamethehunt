import { boundaryPath, DEFAULT_BOUNDARY_COLOR, outsideShade, trackColor, t as tx } from "@hunt/engine";
import { Redirect, router, useSegments } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatDuration } from "../src/core/i18n";
import { playAreaBounds, taskMarkers } from "../src/core/play-area";
import { isAnswerable, listGroups, mapStyleChoice, taskToShow } from "../src/core/view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MessageKey } from "../src/core/i18n";
import { BackendError } from "../src/core/supabase-backend";
import {
  onFix,
  requestLocationPermission,
  startTracking,
  type PermissionResult,
} from "../src/services/location";
import { downloadPlayArea } from "../src/services/map-download";
import { Banner, Body, Button, Screen, Title } from "../src/ui/components";
import { LeaveGame } from "../src/ui/LeaveGame";
import { askStep, pendingSteps, PermissionStepScreen, type PermissionStep } from "../src/ui/PermissionSteps";
import { WebPlayBanners, WebStartInfo, webLocationHelp } from "../src/ui/WebNotices";
import { takePhoto } from "../src/ui/camera";
import { playSiren } from "../src/services/siren";
import { useScreenOn } from "../src/services/screen-on";
import { useGame } from "../src/ui/GameProvider";
import { logError } from "../src/services/diagnostics";
import GameMap from "../src/ui/map/GameMap";
import { colors, contentColumn, radius, space } from "../src/ui/theme";

const SIREN_GAP_MS = 8_000;
const MAP_STYLE_KEY = "hunt.kaartstijl";

export default function PlayScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const { height: screenHeight } = useWindowDimensions();
  const segments = useSegments();
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [position, setPosition] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  // Toestemmingen die nog gevraagd worden, elk met een eigen uitlegscherm (niet in de webapp).
  const [steps, setSteps] = useState<PermissionStep[] | null>(null);
  const [teamPhoto, setTeamPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  // Foutmelding bij teamfoto of starten, zodat het team niet zonder uitleg blijft hangen.
  const [setupError, setSetupError] = useState<MessageKey | null>(null);
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
  useScreenOn();

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
      .catch((error) => logError('kaart_downloaden_mislukt', error, undefined, 'warn'))
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

  // Na het einde regelt het eindscherm de GPS (op weg naar het verzamelpunt).

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

  /** Het spel starten (de toestemmingen zijn dan al gevraagd). */
  const begin = async () => {
    setStarting(true);
    setSetupError(null);
    try {
      await controller.start();
    } catch (e) {
      setSetupError(e instanceof BackendError ? e.key : "errorGeneric");
    } finally {
      setStarting(false);
    }
  };

  /** Start: eerst de uitlegschermen met de vragen van de telefoon, dan het spel. */
  const onStart = async () => {
    if (Platform.OS === "web") return withLocation(() => controller.start());
    const pending = await pendingSteps().catch(() => [] as PermissionStep[]);
    if (pending.length === 0) return begin();
    setSteps(pending);
  };

  /** Volgende uitlegscherm, of starten als alles gevraagd is. */
  const nextStep = async (rest: PermissionStep[]) => {
    if (rest.length > 0) return setSteps(rest);
    setSteps(null);
    await begin();
  };

  /** Locatie vragen en daarna starten. */
  const withLocation = async (next: () => Promise<void>) => {
    setStarting(true);
    setSetupError(null);
    try {
      const result = await requestLocationPermission();
      setPermission(result);
      if (result !== "denied") await next();
    } catch (e) {
      setSetupError(e instanceof BackendError ? e.key : "errorGeneric");
    } finally {
      setStarting(false);
    }
  };

  if (!started && steps && steps.length > 0) {
    const step = steps[0]!;
    return (
      <PermissionStepScreen
        step={step}
        t={t}
        busy={starting}
        onSkip={() => void nextStep(steps.slice(1))}
        onContinue={async () => {
          setStarting(true);
          let result: PermissionResult | null = null;
          try {
            result = await askStep(step);
          } catch (e) {
            logError("toestemming_vragen_mislukt", e, { stap: step }, "warn");
          } finally {
            setStarting(false);
          }
          if (result) setPermission(result);
          // Zonder locatie kan het spel niet: terug naar het startscherm met uitleg.
          if (step === "location" && (result === null || result === "denied")) return setSteps(null);
          const rest = steps.slice(1).filter((s) => !(s === "always" && result === "always"));
          await nextStep(rest);
        }}
      />
    );
  }

  // Eerst de teamfoto, als eigen scherm vóór de teamcode.
  if (!started && snapshot.teamPhotoNeeded && !teamPhoto) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen scroll>
          <Title>{t("teamPhotoTitle")}</Title>
          <Body>{t("teamPhotoExplain")}</Body>
          <View style={styles.spacer} />
          {setupError ? <Banner tone="danger">{t(setupError)}</Banner> : null}
          <Button
            label={t("takeTeamPhoto")}
            busy={photoBusy}
            disabled={photoBusy}
            onPress={async () => {
              setPhotoBusy(true);
              setSetupError(null);
              try {
                const photo = await takePhoto();
                if (!photo) return;
                await controller.submitTeamPhoto(photo.uri);
                setTeamPhoto(photo.uri);
              } catch {
                setSetupError("errorGeneric");
              } finally {
                setPhotoBusy(false);
              }
            }}
          />
          <LeaveGame showCode={false} />
        </Screen>
      </SafeAreaView>
    );
  }

  if (!started) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen scroll>
          <Title>{tx(game.name, lang, game.defaultLanguage)}</Title>
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>{t("yourTeamCode")}</Text>
            {/* Verder spelen gaat met de hunt-code en de teamnaam; oudere opgeslagen spellen kennen alleen de teamcode. */}
            {snapshot.session.joinCode ? (
              <>
                <Body muted>{t("joinCode")}</Body>
                <Text style={styles.teamCode}>{snapshot.session.joinCode}</Text>
                <Body muted>{t("teamName")}</Body>
                <Text style={styles.teamCode}>{snapshot.team.name}</Text>
                <Body>{t("teamCodeExplain")}</Body>
              </>
            ) : (
              <Text style={styles.teamCode}>{snapshot.team.teamCode}</Text>
            )}
          </View>
          {/* Webapp: uitleg dat het scherm aan moet blijven (de browser stopt de GPS anders). */}
          <WebStartInfo lang={lang} />
          <View style={styles.spacer} />
          <Body>{t("locationNeeded")}</Body>
          {Platform.OS !== "web" ? <Body muted>{t("locationAlways")}</Body> : null}
          {permission === "denied" ? (
            webLocationHelp(lang) ? (
              <Banner tone="danger">{webLocationHelp(lang)!}</Banner>
            ) : (
              <>
                <Banner tone="danger">{t("locationDenied")}</Banner>
                <Button
                  kind="secondary"
                  label={t("openSettings")}
                  onPress={() => void Linking.openSettings()}
                />
              </>
            )
          ) : null}
          <View style={styles.spacer} />
          <Body muted>{t("startExplain")}</Body>
          {setupError ? <Banner tone="danger">{t(setupError)}</Banner> : null}
          <Button
            label={t("start")}
            disabled={snapshot.teamPhotoNeeded}
            busy={starting}
            onPress={() => void onStart()}
          />
          <LeaveGame showCode={false} />
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
          ...(game.tasks.find((x) => x.id === m.id)?.mapIcon === "flag"
            ? { flag: game.tasks.find((x) => x.id === m.id)!.mapLabel ?? "" }
            : game.tasks.find((x) => x.id === m.id)?.mapLabel
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
        boundary={
          game.boundary
            ? {
                // Bochten uitgeschreven tot korte rechte stukjes.
                points: boundaryPath(game.boundary),
                color: game.boundary.color ?? DEFAULT_BOUNDARY_COLOR,
                outside: outsideShade(game.boundary),
              }
            : undefined
        }
      />

      <SafeAreaView edges={["top"]} style={styles.top}>
        <View style={styles.header}>
          {/* Punten verdwijnen als het spelverloop dat zegt (actie "Punten verbergen", bijvoorbeeld na 60 minuten). */}
          {state.scoreHiddenAt === undefined ? (
            <View>
              <Text style={styles.headerLabel}>{t("score")}</Text>
              <Text style={styles.headerValue}>{state.score}</Text>
            </View>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            style={styles.styleButton}
            onPress={() => {
              setChosenStyle(style.next);
              void AsyncStorage.setItem(MAP_STYLE_KEY, style.next).catch(() => undefined);
            }}
          >
            <Text style={styles.headerLabel}>{t("mapStyle")}</Text>
            <Text style={styles.styleName} numberOfLines={1}>
              {t(`style_${style.id}` as MessageKey)} ›
            </Text>
          </Pressable>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>{t("time")}</Text>
            <Text style={styles.headerValue}>
              {formatDuration(snapshot.now - ctx.startedAt)}
            </Text>
          </View>
        </View>
        {/* Meldingen kunnen samen nooit meer dan een derde van het scherm bedekken; een lang bericht scrollt. */}
        <ScrollView style={{ maxHeight: screenHeight * 0.35 }} bounces={false}>
          {!snapshot.online ? (
            <Banner tone="warning">{t("offline")}</Banner>
          ) : null}
          {/* Webapp: GPS weggevallen, even uit beeld geweest, scherm kan niet aan blijven. */}
          <WebPlayBanners lang={lang} />
          {weakGps ? <Banner tone="warning">{t("gpsWeak")}</Banner> : null}
          {permission === "denied" && Platform.OS !== "web" ? (
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
              <Banner tone="warning" lines={2}>
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
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} style={styles.bottom}>
        {snapshot.session.testMode ? (
          <ScrollView style={[styles.test, { maxHeight: screenHeight * 0.4 }]} bounces={false}>
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
          </ScrollView>
        ) : null}
        <View style={styles.bottomRow}>
          <View style={styles.bottomMain}>
            <Button
              label={listCount > 0 ? `${t("tasks")} (${listCount})` : t("tasks")}
              onPress={() => router.push("/tasks")}
            />
          </View>
          {controller.teamChat ? (
            <View style={styles.bottomSide}>
              <Button
                kind="secondary"
                label={snapshot.chatUnread > 0 ? `💬 ${snapshot.chatUnread}` : "💬"}
                accessibilityLabel={
                  snapshot.chatUnread > 0 ? `${t("chat")} (${snapshot.chatUnread})` : t("chat")
                }
                onPress={() => router.push("/chat")}
              />
            </View>
          ) : null}
        </View>
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
  bottomRow: { flexDirection: "row", gap: space.sm },
  bottomMain: { flex: 1 },
  bottomSide: { minWidth: 72 },
  codeCard: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    marginTop: space.sm,
  },
  codeLabel: { color: colors.accent, fontWeight: "700", fontSize: 15 },
  teamCode: {
    color: colors.accent,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    marginVertical: space.sm,
  },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.md,
    ...contentColumn,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(37,47,61,0.9)",
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  headerRight: { alignItems: "flex-end" },
  styleButton: { alignItems: "center", paddingHorizontal: space.sm, flexShrink: 1 },
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
    ...contentColumn,
  },
});
