/**
 * Keep original audio when it fits Vercel’s ~4.5 MB JSON body.
 * Otherwise ask for a shorter / smaller MP3 — keep-sections need real quality.
 */

export const SONG_EDIT_MAX_DATAURL_CHARS = 3_900_000;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not encode audio for upload"));
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, fileName: string, compressed: boolean }>}
 */
export async function prepareAudioForSongEdit(file) {
  if (!file) throw new Error("Choose an audio file first.");
  const dataUrl = await blobToDataUrl(file);
  if (!dataUrl.startsWith("data:audio/") && !dataUrl.startsWith("data:application/octet-stream")) {
    throw new Error("Unsupported audio format — use MP3, M4A, or WAV.");
  }
  if (dataUrl.length > SONG_EDIT_MAX_DATAURL_CHARS) {
    throw new Error("Track too large — use an MP3 under about 3 minutes (~3 MB) so Keep sections stay clean.");
  }
  return {
    dataUrl,
    fileName: String(file.name || "song").trim() || "song",
    compressed: false,
  };
}
