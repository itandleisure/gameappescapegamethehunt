import type { PlaygroundReveal, RevealPiece } from "@hunt/engine";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "./theme";

/**
 * Foto van een playground met afgedekte vakken, zoals de GPS-code van het
 * extractiepunt. Elk vak verdwijnt zodra de bijbehorende puzzel goed is.
 */
export function RevealImage({
  reveal,
  hidden,
}: {
  reveal: PlaygroundReveal;
  hidden: RevealPiece[];
}) {
  const pct = (n: number, of: number) => `${(n / of) * 100}%` as const;
  return (
    <View style={[styles.frame, { aspectRatio: reveal.width / reveal.height }]}>
      <Image
        source={{ uri: reveal.image }}
        style={StyleSheet.absoluteFill}
        resizeMode="stretch"
      />
      {hidden.map((p, i) => (
        <View
          key={`${p.task}-${i}`}
          style={[
            styles.cover,
            {
              left: pct(p.x, reveal.width),
              top: pct(p.y, reveal.height),
              width: pct(p.w, reveal.width),
              height: pct(p.h, reveal.height),
            },
          ]}
        >
          <Text style={styles.mark}>?</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  cover: {
    position: "absolute",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { color: colors.accent, fontSize: 28, fontWeight: "800" },
});
