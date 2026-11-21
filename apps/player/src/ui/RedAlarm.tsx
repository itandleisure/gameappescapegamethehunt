import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';

/**
 * Rood alarm over het hele scherm, met een grote tekst: "Hunter in de buurt!"
 * of "Team gepakt!". Knippert `blinks` keer en verdwijnt dan; tikken gaat
 * gewoon door naar het scherm eronder. Een nieuwe `trigger` start het opnieuw.
 */
export function RedAlarm({ trigger, title, body, blinks = 6 }: { trigger: number; title: string; body?: string; blinks?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    setVisible(true);
    opacity.setValue(0);
    const pulse = Animated.sequence([
      Animated.timing(opacity, { toValue: 0.92, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.35, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const anim = Animated.sequence([
      Animated.loop(pulse, { iterations: blinks }),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => anim.stop();
  }, [trigger, blinks, opacity]);

  if (!visible) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.alarm, { opacity }]} accessibilityLiveRegion="assertive">
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  alarm: { backgroundColor: '#d91e18', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000, elevation: 1000 },
  title: { color: '#ffffff', fontSize: 34, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  body: { color: '#ffffff', fontSize: 18, fontWeight: '600', textAlign: 'center', marginTop: 12 },
});
