import {
  canUseHint,
  t as tx,
  type AnswerValue,
  type TeamState,
  type Text as GameText,
} from "@hunt/engine";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { answerFeedback, isAnswerable } from "../../src/core/view";
import {
  Banner,
  Body,
  Button,
  Chip,
  Field,
  Title,
} from "../../src/ui/components";
import { useGame } from "../../src/ui/GameProvider";
import { colors, radius, space } from "../../src/ui/theme";

type Feedback = "correct" | "wrong" | "tryAgain" | "rejected" | null;

/** Eén opdracht: bevestigen, beantwoorden, hints en foto's. */
export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { controller, snapshot, t, lang } = useGame();
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<number[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  /** Afteltimer na "Nee" op de bevestigingsvraag: seconden om de cirkel uit te lopen. */
  const [leaveLeft, setLeaveLeft] = useState<number | null>(null);
  const [askHint, setAskHint] = useState(false);

  const state = snapshot?.state;
  const game = snapshot?.game;
  const task = game?.tasks.find((x) => x.id === id);
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/play");

  // Info-schermen (zoals de speluitleg) gaan na OK zonder melding door.
  const silentDone =
    feedback === "correct" &&
    task?.answer.type === "info" &&
    !task.correctComment;
  useEffect(() => {
    if (silentDone) close();
  }, [silentDone]);

  useEffect(() => {
    if (leaveLeft === null) return;
    if (leaveLeft <= 0) {
      close();
      return;
    }
    const timer = setTimeout(() => setLeaveLeft(leaveLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [leaveLeft]);

  if (!controller || !snapshot || !state || !game || !task)
    return <Redirect href="/play" />;
  if (silentDone) return null;

  const tr0 = (value: GameText | undefined) =>
    tx(value, lang, game.defaultLanguage);
  if (leaveLeft !== null) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Title>{tr0(task.title)}</Title>
          <Text style={styles.countdown}>{leaveLeft}</Text>
          <Body>{t("leaveArea", { seconds: leaveLeft })}</Body>
        </View>
      </SafeAreaView>
    );
  }
  const ctx = controller.context!;
  const ts = state.tasks[task.id]!;
  const tr = (value: GameText | undefined) =>
    tx(value, lang, game.defaultLanguage);

  const submit = async (answer: AnswerValue) => {
    setBusy(true);
    try {
      const before: TeamState = controller.snapshot().state!;
      await controller.answer(task.id, answer);
      const result = answerFeedback(
        before,
        controller.snapshot().state!,
        task.id,
      );
      setFeedback(result);
      if (result === "tryAgain") setText("");
    } finally {
      setBusy(false);
    }
  };

  // Na het antwoord: melding met de toelichting uit het spel.
  if (feedback === "correct" || feedback === "wrong") {
    const comment =
      feedback === "correct" ? task.correctComment : task.wrongComment;
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Title>{feedback === "correct" ? t("correct") : t("wrong")}</Title>
          {task.answer.type === "photo" ? (
            <Body muted>{t("photoSaved")}</Body>
          ) : null}
          {comment ? <Body>{tr(comment)}</Body> : null}
          <Button label={t("ok")} onPress={close} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!isAnswerable(game, ctx, state, task.id)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Title>{tr(task.title)}</Title>
          {task.image ? <TaskImage uri={task.image} /> : null}
          <Body muted>{tr(task.body)}</Body>
          <Button kind="secondary" label={t("close")} onPress={close} />
        </View>
      </SafeAreaView>
    );
  }

  if (ts.status === "confirming") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Title>{tr(task.title)}</Title>
          <Body>{tr(task.confirm)}</Body>
          <Button
            label={t("yes")}
            onPress={() => void controller.confirm(task.id)}
          />
          <Button
            kind="secondary"
            label={t("no")}
            onPress={async () => {
              setLeaveLeft(await controller.decline(task.id));
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const hintsAllowed = canUseHint(game, state, task.id);
  const nextHint = task.hints[ts.hintsUsed];
  const answer = task.answer;

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    // Verkleinen scheelt data en uploadtijd; ruim genoeg voor het fotoboek.
    const resized = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 2048 } }],
      {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    setPhoto(resized.uri);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.safe}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Title>{tr(task.title)}</Title>
          {task.image ? <TaskImage uri={task.image} /> : null}
          <Body>{tr(task.body)}</Body>
          <View style={styles.spacer} />

          {feedback === "tryAgain" ? (
            <Banner tone="danger">{`${t("wrong")} ${t("tryAgain")}`}</Banner>
          ) : null}
          {feedback === "rejected" ? (
            <Banner tone="danger">{t("errorGeneric")}</Banner>
          ) : null}

          {task.hints.slice(0, ts.hintsUsed).map((hint, i) => (
            <View key={i} style={styles.hint}>
              <Text style={styles.hintLabel}>{`${t("hint")} ${i + 1}`}</Text>
              <Body>{tr(hint.text)}</Body>
              {hint.image ? <TaskImage uri={hint.image} /> : null}
            </View>
          ))}

          {answer.type === "info" ? (
            <Button
              label={t("ok")}
              busy={busy}
              onPress={() => void submit({ type: "info" })}
            />
          ) : null}

          {answer.type === "text" || answer.type === "number" ? (
            <>
              <Field
                label={t("answerPlaceholder")}
                value={text}
                onChangeText={setText}
                keyboardType={answer.type === "number" ? "numeric" : "default"}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="send"
              />
              <Button
                label={t("submit")}
                busy={busy}
                disabled={text.trim() === ""}
                onPress={() =>
                  void submit(
                    answer.type === "number"
                      ? { type: "number", value: text }
                      : { type: "text", text },
                  )
                }
              />
            </>
          ) : null}

          {answer.type === "choice" || answer.type === "multi" ? (
            <>
              <View style={styles.options}>
                {answer.options.map((option, i) => (
                  <Chip
                    key={i}
                    label={tr(option)}
                    selected={choice.includes(i)}
                    onPress={() =>
                      setChoice((current) =>
                        answer.type === "choice"
                          ? [i]
                          : current.includes(i)
                            ? current.filter((x) => x !== i)
                            : [...current, i],
                      )
                    }
                  />
                ))}
              </View>
              <Button
                label={t("submit")}
                busy={busy}
                disabled={choice.length === 0}
                onPress={() =>
                  void submit(
                    answer.type === "choice"
                      ? { type: "choice", option: choice[0]! }
                      : { type: "multi", options: choice },
                  )
                }
              />
            </>
          ) : null}

          {answer.type === "photo" ? (
            <>
              {photo ? (
                <Image
                  source={{ uri: photo }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : null}
              <Button
                kind={photo ? "secondary" : "primary"}
                label={photo ? t("retakePhoto") : t("takePhoto")}
                onPress={() => void takePhoto()}
              />
              {photo ? (
                <Button
                  label={t("sendPhoto")}
                  busy={busy}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      await controller.submitPhoto(task.id, photo);
                      setFeedback("correct");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ) : null}
            </>
          ) : null}

          {task.hints.length > 0 ? (
            <Button
              kind="secondary"
              label={
                hintsAllowed && nextHint
                  ? t("hintCost", { cost: nextHint.cost })
                  : t("noMoreHints")
              }
              disabled={!hintsAllowed || !nextHint}
              onPress={() => setAskHint(true)}
            />
          ) : null}
          {askHint && hintsAllowed && nextHint ? (
            <View style={styles.hint}>
              <Body>{t("buyHint", { cost: nextHint.cost })}</Body>
              <Button
                label={t("yes")}
                onPress={() => {
                  setAskHint(false);
                  void controller.useHint(task.id);
                }}
              />
              <Button
                kind="secondary"
                label={t("no")}
                onPress={() => setAskHint(false)}
              />
            </View>
          ) : null}

          {ts.status === "visible" ? (
            <Button kind="secondary" label={t("close")} onPress={close} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Ondersteunende foto bij de opdrachttekst, in de eigen verhouding van de foto. */
function TaskImage({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  return (
    <Image
      source={{ uri }}
      style={[styles.taskImage, { aspectRatio: ratio }]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source;
        if (width > 0 && height > 0)
          setRatio(Math.max(0.6, Math.min(2.5, width / height)));
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl },
  spacer: { height: space.md },
  countdown: {
    color: colors.accent,
    fontSize: 72,
    fontWeight: "800",
    textAlign: "center",
    marginVertical: space.lg,
  },
  hint: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.sm,
  },
  hintLabel: {
    color: colors.accent,
    fontWeight: "700",
    marginBottom: space.xs,
  },
  options: { flexDirection: "row", flexWrap: "wrap" },
  photo: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginBottom: space.sm,
  },
  taskImage: {
    width: "100%",
    borderRadius: radius.md,
    marginBottom: space.md,
    backgroundColor: colors.surface,
  },
});
