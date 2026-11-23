import { BADGE_ICONS, t as tx, type GamePackage } from '@hunt/engine';
import { Share, StyleSheet, Text, View } from 'react-native';
import { formatDuration, type MessageKey } from '../core/i18n';
import { formatKm, lapsFor, stepsFor, type EndStats } from '../core/news';
import { Button } from './components';
import { colors, radius, space } from './theme';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Eindscherm: de oranje kaart met de afgelegde kilometers groot in beeld, de
 * plaats, punten en hoe vaak het team gepakt is, met daaronder de verdiende
 * badges en een knop om het te delen. Gemaakt om een screenshot van te maken.
 */
export function EndCard({ stats, game, teamName, lang, t }: { stats: EndStats; game: GamePackage; teamName: string; lang: string; t: Translate }) {
  const km = formatKm(stats.meters, lang);
  const time = formatDuration(stats.durationMs);
  const number = new Intl.NumberFormat(lang);
  const gameName = tx(game.name, lang, game.defaultLanguage);
  const facts = [
    stats.place !== undefined && stats.teams
      ? `${t('endPlace', { n: stats.place, m: stats.teams })}${stats.provisional ? ` (${t('endPlaceProvisional')})` : ''}`
      : null,
    t('endPoints', { n: number.format(stats.score) }),
    t('endCaught', { n: stats.caught }),
  ].filter((f): f is string => f !== null);

  const share = () => {
    const message = t('endShareText', { team: teamName, game: gameName, km, time, points: number.format(stats.score) });
    void Share.share({ message }).catch(() => undefined);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card} accessible accessibilityLabel={`${teamName}. ${km} km. ${t('endTravelled', { time })}. ${facts.join(', ')}`}>
        {gameName ? (
          <Text style={styles.kicker} numberOfLines={1}>
            {gameName}
          </Text>
        ) : null}
        <Text style={styles.heading}>{stats.escaped ? `${t('endTeamEscaped', { team: teamName })} 🏁` : teamName}</Text>
        <Text style={styles.km} adjustsFontSizeToFit numberOfLines={1}>
          {km}
          <Text style={styles.kmUnit}> km</Text>
        </Text>
        <Text style={styles.travelled}>{t('endTravelled', { time })}</Text>
        {stats.meters >= 100 ? (
          <View style={styles.chips}>
            <Text style={styles.chip}>{t('endLaps', { n: number.format(lapsFor(stats.meters)) })}</Text>
            <Text style={styles.chip}>{t('endSteps', { n: number.format(stepsFor(stats.meters)) })}</Text>
          </View>
        ) : null}
        <View style={styles.facts}>
          {facts.map((f) => (
            <Text key={f} style={styles.fact}>
              {f}
            </Text>
          ))}
        </View>
      </View>

      {stats.badges.length ? (
        <View style={styles.badges}>
          {stats.badges.map((b) => (
            <View key={b} style={styles.badge} accessible accessibilityLabel={t(`badge_${b}` as MessageKey)}>
              <View style={styles.medal}>
                <Text style={styles.medalIcon}>{BADGE_ICONS[b]}</Text>
              </View>
              <Text style={styles.badgeName} numberOfLines={2}>
                {t(`badge_${b}` as MessageKey)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Button kind="secondary" label={`📤 ${t('endShare')}`} onPress={share} />
    </View>
  );
}

const DARK = '#1f2733';

const styles = StyleSheet.create({
  wrap: { gap: space.md, marginBottom: space.lg },
  card: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg - 4,
    gap: space.xs,
    // Iets donkerder onderin, zoals in het ontwerp, zonder verloop-bibliotheek.
    borderBottomWidth: 6,
    borderBottomColor: '#c9741f',
  },
  kicker: { color: DARK, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  heading: { color: DARK, fontSize: 26, fontWeight: '800', lineHeight: 31 },
  km: { color: DARK, fontSize: 80, fontWeight: '900', lineHeight: 88, marginTop: space.xs },
  kmUnit: { fontSize: 30, fontWeight: '800' },
  travelled: { color: DARK, fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chip: {
    color: DARK,
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(31,39,51,0.14)',
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs, marginTop: space.sm },
  fact: { color: DARK, fontSize: 15, fontWeight: '800' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.sm, rowGap: space.md },
  badge: { width: 108, alignItems: 'center', gap: space.xs },
  medal: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: '#c9741f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalIcon: { fontSize: 30 },
  badgeName: { color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
