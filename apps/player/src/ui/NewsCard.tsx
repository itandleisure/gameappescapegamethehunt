import type { GamePackage } from '@hunt/engine';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MessageKey } from '../core/i18n';
import { NEWS_VISIBLE_MS, newsView, type NewsFlash, type NewsTone } from '../core/news';
import { colors, radius, space } from './theme';

const TONE: Record<NewsTone, string> = {
  danger: colors.danger,
  success: colors.success,
  accent: colors.accent,
  muted: colors.textMuted,
};

/**
 * Eén nieuwsflits, zoals onderin de kaart (met `onDismiss`: tikken = weg,
 * en na NEWS_VISIBLE_MS vanzelf weg) en in de lijst Nieuws.
 */
export function NewsCard({
  flash,
  game,
  lang,
  t,
  onDismiss,
  time,
}: {
  flash: NewsFlash;
  game: GamePackage;
  lang: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  onDismiss?: () => void;
  /** Tijd van de flits, in de lijst. */
  time?: string;
}) {
  useEffect(() => {
    if (!onDismiss) return;
    const timer = setTimeout(onDismiss, NEWS_VISIBLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash.id]);
  const view = newsView(flash, game, lang, t);
  const tone = TONE[view.tone];
  const body = (
    <View style={[styles.card, { borderLeftColor: tone }, onDismiss ? styles.floating : null]}>
      <View style={[styles.icon, { backgroundColor: `${tone}26` }]}>
        <Text style={styles.iconText}>{view.icon}</Text>
      </View>
      <View style={styles.text}>
        <Text style={[styles.kicker, { color: tone }]} numberOfLines={1}>
          {view.kicker}
          {time ? <Text style={styles.time}>{`  ${time}`}</Text> : null}
        </Text>
        <Text style={styles.title} numberOfLines={onDismiss ? 3 : undefined}>
          {view.title}
        </Text>
        {view.sub ? (
          <Text style={styles.sub} numberOfLines={onDismiss ? 2 : undefined}>
            {view.sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
  if (!onDismiss) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${view.kicker}: ${view.title}. ${view.sub} ${t('newsTapToClose')}`}
      accessibilityLiveRegion="polite"
      onPress={onDismiss}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    paddingVertical: space.sm + 4,
    paddingHorizontal: space.md,
  },
  floating: {
    backgroundColor: 'rgba(31,39,51,0.97)',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22 },
  text: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  time: { color: colors.textMuted, fontWeight: '400', letterSpacing: 0, textTransform: 'none' },
  title: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20, marginTop: 1 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
