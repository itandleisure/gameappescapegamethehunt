import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { supabase } from '../services/supabase';
import { colors, radius } from './theme';

/** Tijdelijke links naar foto's in de chat, zodat de app ze niet bij elke verversing opnieuw opvraagt. */
const URL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; until: number }>();

async function signedUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, URL_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new Error('geen link');
  cache.set(path, { url: data.signedUrl, until: Date.now() + (URL_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

/**
 * Foto in een chatbericht (bijvoorbeeld van een gepakt team), in de eigen
 * verhouding. Tikken opent hem groot. Zonder bereik blijft het vak leeg tot
 * de foto wel te laden is.
 */
export function ChatPhoto({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState<string | null>(cache.get(path)?.url ?? null);
  const [ratio, setRatio] = useState(4 / 3);

  useEffect(() => {
    let alive = true;
    signedUrl(path)
      .then((u) => {
        if (!alive) return;
        setUrl(u);
        Image.getSize(u, (w, h) => alive && w > 0 && h > 0 && setRatio(w / h), () => undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      disabled={!url}
      onPress={() => url && void Linking.openURL(url)}
      style={[styles.frame, { aspectRatio: Math.max(0.6, Math.min(ratio, 2)) }]}
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { width: 240, maxWidth: '100%', marginTop: 6, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  image: { width: '100%', height: '100%' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
