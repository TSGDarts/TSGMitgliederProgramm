// Erzeugt die App-Icons (PNG) aus einem SVG-Dartscheiben-Motiv.
// Ausführen mit: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#c8102e"/>
  <circle cx="256" cy="256" r="178" fill="#ffffff"/>
  <circle cx="256" cy="256" r="140" fill="#111318"/>
  <circle cx="256" cy="256" r="100" fill="#ffffff"/>
  <circle cx="256" cy="256" r="62" fill="#111318"/>
  <circle cx="256" cy="256" r="26" fill="#c8102e"/>
  <!-- Dartpfeil -->
  <g transform="rotate(-45 256 256)">
    <rect x="248" y="40" width="16" height="150" rx="8" fill="#f3c614"/>
    <polygon points="256,20 240,60 272,60" fill="#f3c614"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });

const buf = Buffer.from(svg);
await sharp(buf).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(buf).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");

console.log("Icons erzeugt: icon-512.png, icon-192.png, apple-touch-icon.png");
