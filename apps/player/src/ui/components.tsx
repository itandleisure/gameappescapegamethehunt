import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, space } from './theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
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

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' | 'danger' }) {
  const background = { info: colors.surfaceRaised, warning: colors.accent, success: colors.success, danger: colors.danger }[tone];
  const color = tone === 'warning' ? colors.accentText : colors.text;
  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <Text style={[styles.bannerText, { color }]}>{children}</Text>
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
  screen: { flex: 1, backgroundColor: colors.background, padding: space.md },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', marginBottom: space.md },
  body: { color: colors.text, fontSize: 17, lineHeight: 24 },
  muted: { color: colors.textMuted },
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
