import QRCode from "qrcode";

/**
 * The closing slide's QR code: error correction M, a quiet zone of 4 modules, dark modules on white,
 * drawn with crisp edges at the largest whole module size that fits the plate's 496 stage px. Pure and offline:
 * the same input renders the same SVG.
 */
export const QR_BOX = 496;
export const QR_MIN_MODULE = 12;

export async function qrSvg(url: string): Promise<{ svg: string; modules: number; module: number; size: number }> {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 4;
  const total = n + quiet * 2;
  const px = Math.floor(QR_BOX / total);
  const size = px * total;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(y, x)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  const title = url.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges" data-modules="${total}" data-module="${px}"><title>QR code for ${title}</title><rect width="${total}" height="${total}" fill="#FFFFFF"/><path fill="#000000" d="${d}"/></svg>\n`;
  return { svg, modules: total, module: px, size };
}
