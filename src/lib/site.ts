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
  { href: "/mitglieder/termine", label: "Termine & Zusagen", icon: "calendar" },
  { href: "/mitglieder/mannschaften", label: "Mannschaften", icon: "users" },
  { href: "/mitglieder/nuliga", label: "nuLiga", icon: "table" },
  { href: "/mitglieder/fragen", label: "Fragen", icon: "chat" },
  { href: "/mitglieder/profil", label: "Mein Profil", icon: "user" },
];

export const adminNav = [
  { href: "/mitglieder/admin/mitglieder", label: "Mitglieder verwalten", icon: "shield" },
  { href: "/mitglieder/admin/mannschaften", label: "Mannschaften verwalten", icon: "shield" },
  { href: "/mitglieder/admin/termine", label: "Termine verwalten", icon: "shield" },
];
