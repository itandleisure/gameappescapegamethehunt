import { isRich, parseRich, type RichSpan } from '@hunt/engine';
import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { colors, contentColumn, radius, space } from './theme';

/**
 * Een scherm met marge rondom. Met `scroll` kan de inhoud scrollen, zodat
 * ook op een kleine telefoon of met grote letters alle knoppen bereikbaar zijn.
 */
export function Screen({ children, style, scroll }: { children: ReactNode; style?: ViewStyle; scroll?: boolean }) {
  if (scroll) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.screen, styles.scrollContent, style]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  // Opgemaakte tekst uit de beheerapp (vet, kleur, lijsten, links, uitlijning).
  if (typeof children === 'string' && isRich(children)) return <RichBody text={children} muted={muted} />;
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

function spanStyle(s: RichSpan): TextStyle {
  const color = s.color ?? (s.href ? colors.accent : undefined);
  return {
    ...(s.bold ? { fontWeight: '700' as const } : null),
    ...(s.italic ? { fontStyle: 'italic' as const } : null),
    ...(s.underline || s.href ? { textDecorationLine: 'underline' as const } : null),
    ...(color ? { color } : null),
  };
}

function RichBody({ text, muted }: { text: string; muted?: boolean }) {
  let n = 0;
  let prev: string | undefined;
  return (
    <View>
      {parseRich(text).map((b, i) => {
        if (b.list !== prev) n = 0;
        prev = b.list;
        const bullet = b.list === 'ol' ? `${++n}. ` : b.list === 'ul' ? '•  ' : '';
        return (
          <Text key={i} style={[styles.body, muted && styles.muted, b.align ? { textAlign: b.align } : null, b.list ? styles.listItem : null]}>
            {bullet}
            {b.spans.length === 0 ? ' ' : null}
            {b.spans.map((s, j) => (
              <Text key={j} style={spanStyle(s)} onPress={s.href ? () => void Linking.openURL(s.href!) : undefined}>
                {s.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && styles.buttonDanger,
        (pressed || off) && styles.buttonDim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colors.accentText : colors.text} />
      ) : (
        <Text style={[styles.buttonLabel, kind !== 'primary' && styles.buttonLabelLight]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; hint?: string }) {
  const { label, hint, style, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} style={[styles.input, style]} {...rest} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Banner({
  children,
  tone = 'info',
  lines,
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'danger';
  /** Hoogstens zoveel regels (met … erachter), zodat een lang bericht de kaart niet bedekt. */
  lines?: number;
}) {
  const background = { info: colors.surfaceRaised, warning: colors.accent, success: colors.success, danger: colors.danger }[tone];
  const color = tone === 'warning' ? colors.accentText : colors.text;
  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <Text style={[styles.bannerText, { color }]} numberOfLines={lines}>
        {children}
      </Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]} accessibilityState={{ selected }}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: space.md, ...contentColumn },
  scroll: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, flex: undefined, paddingBottom: space.xl },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', marginBottom: space.md },
  body: { color: colors.text, fontSize: 17, lineHeight: 24 },
  muted: { color: colors.textMuted },
  listItem: { paddingLeft: space.sm },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    alignItems: 'center',
    marginTop: space.sm,
  },
  buttonSecondary: { backgroundColor: colors.surfaceRaised },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDim: { opacity: 0.6 },
  buttonLabel: { color: colors.accentText, fontSize: 17, fontWeight: '700' },
  buttonLabelLight: { color: colors.text },
  field: { marginBottom: space.md },
  label: { color: colors.textMuted, fontSize: 14, marginBottom: space.xs },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 18,
  },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: space.xs },
  banner: { borderRadius: radius.sm, padding: space.sm, marginBottom: space.sm },
  bannerText: { fontSize: 14, fontWeight: '600' },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.text, fontSize: 15 },
  chipLabelSelected: { color: colors.accentText, fontWeight: '700' },
});
