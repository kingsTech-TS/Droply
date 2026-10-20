// A still frame from a video, scaled down, as a JPEG (event-room previews). Uses a detached
// <video> element; gives up quietly (null) on formats the browser can't play or after a timeout.
const TIMEOUT_MS = 8000;

export function videoFrame(file: Blob, maxDimension: number, quality = 0.7): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      // A moment in, past black lead-in frames.
      video.currentTime = Math.min(1, (video.duration || 0) / 10);
    };
    video.onseeked = () => {
      const { videoWidth: w, videoHeight: h } = video;
      if (!w || !h) return finish(null);
      const scale = Math.min(1, maxDimension / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return finish(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => finish(blob), "image/jpeg", quality);
    };
    video.src = url;
  });
}
