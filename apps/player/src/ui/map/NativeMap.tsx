import {
  Camera,
  GeoJSONSource,
  ImageSource,
  Layer,
  Map,
  Marker,
  NativeUserLocation,
} from "@maplibre/maplibre-react-native";
import { boundaryGeoJson } from "@hunt/engine";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "../theme";
import type { GameMapProps } from "./types";

/** Kaart met de native MapLibre-module (in de echte app). */
export default function NativeMap({
  styleUrl,
  bounds,
  markers,
  overlay,
  boundary,
}: GameMapProps) {
  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={styleUrl}
      attribution
      attributionPosition={{ bottom: 8, left: 8 }}
      logo={false}
    >
      <Camera
        initialViewState={
          bounds
            ? {
                bounds,
                padding: { top: 120, bottom: 120, left: 40, right: 40 },
              }
            : undefined
        }
      />
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
          <Layer
            type="raster"
            id="overlay-layer"
            paint={{ "raster-opacity": 0.85 }}
          />
        </ImageSource>
      ) : null}
      {boundary ? (
        <GeoJSONSource id="boundary" data={boundaryGeoJson(boundary) as GeoJSON.GeoJSON}>
          <Layer
            type="line"
            id="boundary-line"
            layout={{ "line-join": "round" }}
            paint={{ "line-color": boundary.color, "line-width": 3 }}
          />
        </GeoJSONSource>
      ) : null}
      {markers.map((m) => (
        <Marker key={m.id} id={m.id} lngLat={[m.lng, m.lat]} anchor="bottom">
          {m.logoColor ? (
            <View style={[styles.logo, { backgroundColor: m.logoColor }]}>
              <Image
                source={require("../../../assets/logo-icoon.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={[styles.pin, m.badge ? styles.badge : null]}>
              <Text
                style={[styles.pinText, m.badge ? styles.badgeText : null]}
                numberOfLines={1}
              >
                {m.badge ?? m.label}
              </Text>
            </View>
          )}
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
  logo: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 28, height: 28 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 16 },
  pinText: { color: colors.accentText, fontWeight: "700", fontSize: 13 },
});
