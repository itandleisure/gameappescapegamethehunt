/** Webapp: seintje bij een popup. Trillen kan op Android; een iPhone kent trillen in de browser niet. */
export async function playSiren(): Promise<void> {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // niet ondersteund
  }
}
