import { Camera, ImageSource, Layer, Map, Marker, NativeUserLocation } from '@maplibre/maplibre-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '../theme';
import type { GameMapProps } from './types';

/** Kaart met de native MapLibre-module (in de echte app). */
export default function NativeMap({ styleUrl, bounds, markers, overlay }: GameMapProps) {
  return (
    <Map style={StyleSheet.absoluteFill} mapStyle={styleUrl} attribution attributionPosition={{ bottom: 8, left: 8 }} logo={false}>
      <Camera initialViewState={bounds ? { bounds, padding: { top: 120, bottom: 120, left: 40, right: 40 } } : undefined} />
      {overlay ? (
        <ImageSource
          id="overlay"
          url={overlay.url}
          coordinates={[
            [overlay.nw.lng, overlay.nw.lat],
            [overlay.se.lng, overlay.nw.lat],
            [overlay.se.lng, overlay.se.lat],
            [overlay.nw.lng, overlay.se.lat],
          ]}
        >
          <Layer type="raster" id="overlay-layer" paint={{ 'raster-opacity': 0.85 }} />
        </ImageSource>
      ) : null}
      {markers.map((m) => (
        <Marker key={m.id} id={m.id} lngLat={[m.lng, m.lat]} anchor="bottom">
          <View style={styles.pin}>
            <Text style={styles.pinText} numberOfLines={1}>
              {m.label}
            </Text>
          </View>
        </Marker>
      ))}
      <NativeUserLocation mode="heading" />
    </Map>
  );
}

const styles = StyleSheet.create({
  pin: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    maxWidth: 160,
    borderWidth: 2,
    borderColor: colors.background,
  },
  pinText: { color: colors.accentText, fontWeight: '700', fontSize: 13 },
});
