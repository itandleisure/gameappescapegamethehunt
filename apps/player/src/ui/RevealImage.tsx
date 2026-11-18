import type { PlaygroundReveal, RevealPiece } from "@hunt/engine";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { fitImage } from "../core/photo";
import { CONTENT_MAX_WIDTH, colors, radius, space } from "./theme";

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
  const screen = useWindowDimensions();
  const pct = (n: number, of: number) => `${(n / of) * 100}%` as const;
  // Altijd in de eigen verhouding (de vakken rekenen in pixels van de foto), maar nooit hoger dan het scherm.
  const box = fitImage(
    { width: Math.max(reveal.width, 1000), height: (Math.max(reveal.width, 1000) * reveal.height) / reveal.width },
    { width: Math.min(screen.width, CONTENT_MAX_WIDTH) - 2 * space.md, maxHeight: screen.height * 0.6 },
  );
  return (
    <View style={[styles.frame, box]}>
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
    alignSelf: "center",
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
  mark: { color: colors.accent, fontSize: 24, fontWeight: "800" },
});
