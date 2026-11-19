import type { CodeView } from "@hunt/engine";
import { StyleSheet, Text, View } from "react-native";
import { Body } from "./components";
import { colors, radius, space } from "./theme";

/**
 * De GPS-code van het extractiepunt als vakjes, drie per rij, met daaronder het
 * hintveld. Een vakje toont zijn stukje code zodra de bijbehorende opdracht goed
 * is; tot die tijd staat er een vraagteken.
 */
export function CodeBoxes({
  view,
  hintText,
  hintTitle,
}: {
  view: CodeView;
  /** De hinttekst in de taal van het team, als het hintveld open is. */
  hintText?: string;
  /** Kopje boven het hintveld, zoals "Hint extractiepunt". */
  hintTitle?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {view.boxes.map((value, i) => (
          <View key={i} style={styles.cell}>
            <View
              style={[styles.box, value !== null && styles.boxOpen]}
              accessibilityLabel={value ?? "?"}
            >
              <Text
                style={value !== null ? styles.value : styles.mark}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {value ?? "?"}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {view.hint && hintTitle ? (
        <Text style={styles.hintTitle}>{hintTitle}</Text>
      ) : null}
      {view.hint ? (
        <View style={[styles.hint, view.hint.open && styles.boxOpen]}>
          {view.hint.open && hintText ? (
            <Body>{hintText}</Body>
          ) : (
            <Text style={styles.mark}>?</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const GAP = space.md;

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -GAP / 2 },
  cell: { width: "33.333%", paddingHorizontal: GAP / 2, marginBottom: GAP },
  box: {
    minHeight: 72,
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
  },
  boxOpen: { backgroundColor: colors.surfaceRaised },
  value: { color: colors.text, fontSize: 30, fontWeight: "800" },
  mark: { color: colors.accent, fontSize: 24, fontWeight: "800" },
  hintTitle: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
    marginTop: space.sm,
    marginBottom: space.md,
    textTransform: "uppercase",
  },
  hint: {
    minHeight: 72,
    padding: space.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
  },
});
