// Erzeugt die App-Icons (PNG) für die Mitglieder-App.
// Design: bewusst ANDERS als das schwarz-weiße Steeldart-Logo der
// Competition-App – flach, in den Vereinsfarben Rot/Grün, textbasiert.
// Ausführen mit: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d41230"/>
      <stop offset="1" stop-color="#960c21"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <!-- dezente Ziel-Ringe als Dart-Anklang -->
  <circle cx="256" cy="212" r="168" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="26"/>
  <circle cx="256" cy="212" r="104" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="18"/>
  <!-- Schriftzug -->
  <text x="256" y="176" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="112" fill="#ffffff">TSG</text>
  <text x="256" y="312" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="150" fill="#ffffff">08</text>
  <!-- gruenes Band -->
  <rect x="52" y="352" width="408" height="92" rx="28" fill="#2e9e46"/>
  <text x="256" y="420" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="62" fill="#ffffff">ROTH</text>
</svg>`;

mkdirSync("public/icons", { recursive: true });

const buf = Buffer.from(svg);
await sharp(buf).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(buf).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");
// Favicon (Browser-Tab + Desktop-Installation): src/app/icon.png ersetzt
// das alte favicon.ico aus der Projektvorlage
await sharp(buf).resize(256, 256).png().toFile("src/app/icon.png");

console.log(
  "Icons erzeugt: icon-512.png, icon-192.png, apple-touch-icon.png, src/app/icon.png",
);
