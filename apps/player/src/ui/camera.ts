import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { photoResize } from '../core/photo';
import { logIssue } from '../services/diagnostics';

export interface Photo {
  uri: string;
  width: number;
  height: number;
}

/**
 * Foto maken met de camera, verkleind tot maximaal 2048 px aan de langste
 * zijde (staand, liggend of panorama) en als JPEG opgeslagen: een paar
 * honderd KB in plaats van 5 tot 15 MB, wat data en uploadtijd scheelt.
 * Kleinere foto's worden niet vergroot. Null bij annuleren of geen toestemming.
 */
export async function takePhoto(): Promise<Photo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const photo = await shrink(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }));
  if (photo) void keepOnPhone(photo.uri);
  return photo;
}

export interface Video {
  uri: string;
  /** Lengte in seconden (afgerond), voor op het scherm. */
  seconds: number;
  contentType: 'video/mp4' | 'video/quicktime';
}

/**
 * Video filmen voor een video-opdracht, met geluid en hoogstens `maxSeconds`
 * lang. In middelmatige kwaliteit: 30 seconden is dan zo'n 10 tot 25 MB.
 * De telefoon vraagt hier pas om de camera (en bij het filmen om de
 * microfoon), dus alleen als een team echt een video-opdracht doet.
 * Null bij annuleren of geen toestemming.
 */
export async function recordVideo(maxSeconds: number): Promise<Video | 'tooLong' | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: maxSeconds,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const quicktime = asset.mimeType === 'video/quicktime' || /\.mov$/i.test(asset.uri);
  void keepOnPhone(asset.uri);
  return {
    uri: asset.uri,
    seconds: Math.round((asset.duration ?? 0) / 1000),
    contentType: quicktime ? 'video/quicktime' : 'video/mp4',
  };
}

/**
 * Bewaart een foto of video die in het spel gemaakt is ook in de fotogalerij
 * van de telefoon, zodat het team hem na afloop heeft. De toestemming
 * (alleen opslaan, niet de galerij lezen) vraagt de telefoon bij de eerste
 * foto. Weigeren of mislukken stoort het spel niet.
 */
async function keepOnPhone(uri: string): Promise<void> {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return;
    await MediaLibrary.saveToLibraryAsync(uri);
  } catch (error) {
    logIssue('info', 'galerij_opslaan_mislukt', 'Foto of video niet in de galerij van de telefoon bewaard', {
      fout: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Een foto kiezen die al op de telefoon staat (fotobibliotheek), op dezelfde
 * manier verkleind. Null bij annuleren. Voor de spelleider, die een eerder
 * gemaakte foto in de teamchat zet.
 */
export async function pickPhoto(): Promise<Photo | null> {
  return shrink(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 }));
}

async function shrink(result: ImagePicker.ImagePickerResult): Promise<Photo | null> {
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const resize = photoResize(asset.width, asset.height);
  // Ook zonder verkleinen opnieuw opslaan: dan is het altijd een JPEG (geen HEIC van de iPhone) en staat hij rechtop.
  const saved = await ImageManipulator.manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
