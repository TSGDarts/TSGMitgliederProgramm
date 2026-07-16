// Zentrale Vereins-/Seiten-Konfiguration.
// Hier alle vereinsspezifischen Angaben pflegen.

export const site = {
  clubName: "TSG 08 Roth",
  section: "Dart",
  fullName: "Turn- und Sportgemeinschaft 08 Roth e.V. – Dart",
  tagline: "Dart-Abteilung der TSG 08 Roth",
  contactEmail: "dart@tsg08roth.de",
  // Öffentliche nuLiga-Startseite des Verbands (Beispiel – bitte anpassen):
  nuligaPortalUrl: "https://dwbv.liga.nu/cgi-bin/WebObjects/nuLigaDART.woa",
};

export const publicNav = [
  { href: "/", label: "Start" },
  { href: "/mannschaften", label: "Mannschaften" },
  { href: "/termine", label: "Termine" },
  { href: "/kontakt", label: "Kontakt" },
];

export const memberNav = [
  { href: "/mitglieder", label: "Übersicht", icon: "home" },
  { href: "/mitglieder/kalender", label: "Kalender", icon: "calendar" },
  { href: "/mitglieder/ergebnisse", label: "Ergebnisse", icon: "target" },
  { href: "/mitglieder/termine", label: "Termine & Zusagen", icon: "calendar" },
  { href: "/mitglieder/training", label: "Training", icon: "dumbbell" },
  { href: "/mitglieder/mannschaften", label: "Mannschaften", icon: "users" },
  { href: "/mitglieder/turniere", label: "Turniere", icon: "trophy" },
  { href: "/mitglieder/competitions", label: "Competitions", icon: "target" },
  { href: "/mitglieder/statistiken", label: "Statistiken", icon: "chart" },
  { href: "/mitglieder/saisonabfrage", label: "Saisonabfrage", icon: "clipboard" },
  { href: "/mitglieder/nuliga", label: "nuLiga", icon: "table" },
  { href: "/mitglieder/fragen", label: "Fragen & Feedback", icon: "chat" },
  { href: "/mitglieder/regeln", label: "Regeln", icon: "book" },
  { href: "/mitglieder/app", label: "App & Teilen", icon: "share" },
  { href: "/mitglieder/profil", label: "Mein Profil", icon: "user" },
];

// Raumbelegung des Hauptvereins (Locaboo) – Reiter nur für
// Kapitäne/Vize/Bearbeiter/Admins, öffnet direkt die Buchungsseite.
export const locabooNavItem = {
  href: "https://booking.locaboo.com/de/tsg-08-roth-e-v/seminarraum",
  label: "Raumbelegung (Locaboo)",
  icon: "building",
  external: true,
};

export const adminNav = [
  { href: "/mitglieder/admin/saisons", label: "Saisonplanung", icon: "shield" },
  { href: "/mitglieder/admin/beitritt", label: "Selbst-Anmeldung (Link/QR)", icon: "shield" },
  { href: "/mitglieder/admin/mitglieder", label: "Mitglieder verwalten", icon: "shield" },
  { href: "/mitglieder/admin/mannschaften", label: "Mannschaften verwalten", icon: "shield" },
  { href: "/mitglieder/admin/gegner", label: "Gegner verwalten", icon: "shield" },
  { href: "/mitglieder/admin/termine", label: "Termine verwalten", icon: "shield" },
  { href: "/mitglieder/admin/einstellungen", label: "Einstellungen", icon: "shield" },
];

// Verwaltungs-Links für die Rolle „Bearbeiter“: Termine, Gegner und
// Mannschaften – keine Mitglieder-/Rollen-Verwaltung.
export const editorNav = adminNav.filter((item) =>
  [
    "/mitglieder/admin/mannschaften",
    "/mitglieder/admin/gegner",
    "/mitglieder/admin/termine",
  ].includes(item.href),
);
