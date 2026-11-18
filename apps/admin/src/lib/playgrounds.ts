import type { PlaygroundReveal, RevealPiece } from "@hunt/engine";

/** Een punt op de foto in pixels van de foto zelf, uit een muispositie op de (verkleinde) weergave. */
export function toImagePoint(
  client: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  image: { width: number; height: number },
): { x: number; y: number } {
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);
  return {
    x: Math.round(
      clamp(((client.x - box.left) / box.width) * image.width, image.width),
    ),
    y: Math.round(
      clamp(((client.y - box.top) / box.height) * image.height, image.height),
    ),
  };
}

/** Het vak tussen twee hoeken, in welke richting er ook gesleept is. */
export function rectBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Pick<RevealPiece, "x" | "y" | "w" | "h"> {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** Een nieuw vak midden op de foto, zodat er altijd iets te zien en te verslepen is. */
export function newPiece(
  reveal: Pick<PlaygroundReveal, "width" | "height">,
  task: string,
): RevealPiece {
  const w = Math.round(reveal.width / 3);
  const h = Math.round(Math.min(reveal.height / 6, w * 0.6));
  return {
    task,
    x: Math.round((reveal.width - w) / 2),
    y: Math.round((reveal.height - h) / 2),
    w,
    h,
  };
}

/** Een geldige sleutel voor een nieuw tabblad: kleine letters, cijfers en streepjes. */
export function playgroundKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
