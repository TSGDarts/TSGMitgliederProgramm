/** Ohne plausibles Geburtsjahr nur Tag und Monat anzeigen, kein Alter raten. */
export function geburtstagsAlter(
  geburtsdatum: string,
  geburtstagsjahr: number,
  aktuellesJahr: number,
): number | null {
  const geburtsjahr = Number(geburtsdatum.slice(0, 4));
  if (![geburtsjahr, geburtstagsjahr, aktuellesJahr].every(Number.isInteger)
    || geburtsjahr < 1 || geburtsjahr >= aktuellesJahr) return null;
  const alter = geburtstagsjahr - geburtsjahr;
  return alter > 0 ? alter : null;
}
