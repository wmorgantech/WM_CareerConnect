

export function fullscreenSupported() {
  return Boolean(document.documentElement.requestFullscreen);
}

export function inFullscreen() {
  return Boolean(document.fullscreenElement);
}

export async function enterFullscreen() {
  if (!fullscreenSupported()) return false;

  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();

    return true;
  } catch {
    return false;
  }
}

export async function leaveFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {

  }
}
