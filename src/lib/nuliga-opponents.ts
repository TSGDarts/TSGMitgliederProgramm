export interface NuligaAddress {
  street: string;
  zip: string;
  city: string;
  address: string;
}

export interface NuligaMatchInfo {
  opponentName: string;
  opponentTeamNo: number;
  homeAway: "heim" | "auswaerts";
  opponentAddress: NuligaAddress | null;
  /** Vollständige nuLiga-Bezeichnung vor dem Abtrennen der Mannschaftsnummer. */
  rawOpponentName: string;
  /** Spielstättenname ohne nuLiga-Hallennummer, sofern vorhanden. */
  venueName: string;
}

type NuligaEventText = {
  summary: string;
  description: string;
  location: string;
};

const KNOWN_ROMAN_CLUB_NAMES = ["Heinrich VIII"];

function compact(value: string, max = 240): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Stabiler Abgleichschlüssel, ohne ähnlich klingende Vereine zu vermischen. */
export function normalizeOpponentName(value: string): string {
  return compact(value.normalize("NFKC"), 180)
    .replace(/[‘’`´]/g, "'")
    .replace(/\be\.\s*v\./gi, "e.v.")
    .replace(/\s+e\.v\.?$/i, "")
    .toLocaleLowerCase("de-DE");
}

function descriptionField(description: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im").exec(
    description,
  );
  return match ? compact(match[1]) : "";
}

function romanValue(value: string): number | null {
  const roman = value.toUpperCase();
  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
  };
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = values[roman[i]];
    const next = values[roman[i + 1]] ?? 0;
    if (!current) return null;
    total += current < next ? -current : current;
  }
  if (total < 2 || total > 99) return null;

  const steps: [number, string][] = [
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rest = total;
  let canonical = "";
  for (const [number, symbol] of steps) {
    while (rest >= number) {
      canonical += symbol;
      rest -= number;
    }
  }
  return canonical === roman ? total : null;
}

function splitOpponentTeam(
  value: string,
  protectedClubNames: string[] = KNOWN_ROMAN_CLUB_NAMES,
): {
  name: string;
  teamNo: number;
} {
  const name = compact(value, 180);
  const nameKey = normalizeOpponentName(name);
  const protectedNames = protectedClubNames
    .map((clubName) => ({
      name: compact(clubName, 180),
      key: normalizeOpponentName(clubName),
    }))
    .filter((club) => club.key)
    .sort((a, b) => b.key.length - a.key.length);

  const exactClub = protectedNames.find((club) => club.key === nameKey);
  if (exactClub) return { name: exactClub.name, teamNo: 1 };

  for (const club of protectedNames) {
    if (!nameKey.startsWith(`${club.key} `)) continue;
    const suffix = nameKey.slice(club.key.length + 1);
    const teamNo = romanValue(suffix);
    if (teamNo) return { name: club.name, teamNo };
  }

  const suffix = /^(.*\S)\s+([IVXLC]+)$/i.exec(name);
  if (!suffix) return { name, teamNo: 1 };
  const teamNo = romanValue(suffix[2]);
  return teamNo
    ? { name: compact(suffix[1], 180), teamNo }
    : { name, teamNo: 1 };
}

function parseAddress(value: string): NuligaAddress | null {
  let candidate = compact(value, 320);
  const venuePrefix = /\)\s*:\s*(.+)$/.exec(candidate);
  if (venuePrefix) candidate = compact(venuePrefix[1], 320);

  const match = /^(.+?)\s*,\s*(\d{5})\s+(.+)$/.exec(candidate);
  if (!match) return null;
  const street = compact(match[1], 160);
  const zip = match[2];
  const city = compact(match[3], 120);
  if (!street || !city) return null;
  return {
    street,
    zip,
    city,
    address: `${street}, ${zip} ${city}`,
  };
}

function stripLeaguePrefix(
  value: string,
  league: string,
): { value: string; stripped: boolean } {
  const compactValue = compact(value);
  const compactLeague = compact(league);
  if (!compactLeague) return { value: compactValue, stripped: false };
  const escaped = compactLeague
    .split(" ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const withoutLeague = compactValue.replace(
    new RegExp(`^${escaped}\\s+`, "i"),
    "",
  );
  return {
    value: withoutLeague,
    stripped: withoutLeague !== compactValue,
  };
}

function descriptionLeague(description: string): string {
  return (
    description
      .split(/\r?\n/)
      .map((line) => compact(line))
      .find((line) => line && !/^[\p{L}-]+\s*:/u.test(line)) ?? ""
  );
}

function venueName(description: string): string {
  return descriptionField(description, "Halle").replace(
    /\s*\(\d+\)\s*$/,
    "",
  );
}

/**
 * Gleicht mehrdeutige Vereinsnamen mit römischer Endung feedweit ab.
 * Beispiel: "Heinrich VIII" ist der Verein, "Heinrich VIII II" dessen Zweite.
 */
export function resolveNuligaOpponentTeams(
  matches: (NuligaMatchInfo | null)[],
): (NuligaMatchInfo | null)[] {
  const clubNames = new Map<string, string>();
  const addClub = (name: string) => {
    const compactName = compact(name, 180);
    const key = normalizeOpponentName(compactName);
    if (key && !clubNames.has(key)) clubNames.set(key, compactName);
  };

  // Offizieller Vereinsname, dessen römische Endung keine Mannschaftsnummer ist.
  // Weitere mehrdeutige Namen werden unten aus Paarungen im Feed erkannt.
  for (const name of KNOWN_ROMAN_CLUB_NAMES) addClub(name);

  const rawNames = matches
    .filter((match): match is NuligaMatchInfo => Boolean(match))
    .map((match) => match.rawOpponentName);
  for (const possibleClub of rawNames) {
    const clubKey = normalizeOpponentName(possibleClub);
    if (
      rawNames.some((candidate) => {
        const candidateKey = normalizeOpponentName(candidate);
        if (!candidateKey.startsWith(`${clubKey} `)) return false;
        return romanValue(candidateKey.slice(clubKey.length + 1)) !== null;
      })
    ) {
      addClub(possibleClub);
    }
  }

  for (const match of matches) {
    if (
      match?.homeAway === "auswaerts" &&
      normalizeOpponentName(match.venueName) ===
        normalizeOpponentName(match.rawOpponentName)
    ) {
      addClub(match.rawOpponentName);
    }
  }

  const protectedNames = [...clubNames.values()];
  return matches.map((match) => {
    if (!match) return null;
    const opponent = splitOpponentTeam(match.rawOpponentName, protectedNames);
    return {
      ...match,
      opponentName: opponent.name,
      opponentTeamNo: opponent.teamNo,
    };
  });
}

/**
 * Liest Heim/Gast bevorzugt aus den strukturierten nuLiga-Beschreibungszeilen.
 * Der Titel dient nur als Rückfall für ältere oder abweichende Kalenderdateien.
 */
export function parseNuligaMatch(
  event: NuligaEventText,
  ownTeamName: string,
  league = "",
): NuligaMatchInfo | null {
  const ownKey = normalizeOpponentName(ownTeamName);
  if (!ownKey) return null;

  let home = descriptionField(event.description, "Heim");
  let away = descriptionField(event.description, "Gast");

  if (!home || !away) {
    const withoutMatchNo = event.summary.replace(/\s*\(\d+\)\s*$/, "");
    const sides = withoutMatchNo.split(/\s+vs\.?\s+/i);
    if (sides.length !== 2) return null;
    const left = compact(sides[0], 180);
    const leagueCandidates = [descriptionLeague(event.description), league]
      .map((candidate) => compact(candidate))
      .filter(Boolean);
    let safeLeft = { value: left, stripped: false };
    for (const candidate of leagueCandidates) {
      safeLeft = stripLeaguePrefix(left, candidate);
      if (safeLeft.stripped) break;
    }
    // Ohne strukturiertes Heim/Gast darf ein unbekannter Liga-Präfix nicht
    // versehentlich Teil des Gegnernamens werden.
    if (!safeLeft.stripped && normalizeOpponentName(left) !== ownKey) return null;
    home = safeLeft.value;
    away = compact(sides[1], 180);
  }

  const homeIsOwn = normalizeOpponentName(home) === ownKey;
  const awayIsOwn = normalizeOpponentName(away) === ownKey;
  if (homeIsOwn === awayIsOwn) return null;

  const homeAway = homeIsOwn ? "heim" : "auswaerts";
  const rawOpponentName = compact(homeIsOwn ? away : home, 180);
  const parsedVenueName = venueName(event.description);
  const opponent = splitOpponentTeam(
    rawOpponentName,
    homeAway === "auswaerts" &&
      normalizeOpponentName(parsedVenueName) ===
        normalizeOpponentName(rawOpponentName)
      ? [...KNOWN_ROMAN_CLUB_NAMES, rawOpponentName]
      : KNOWN_ROMAN_CLUB_NAMES,
  );
  if (!opponent.name || normalizeOpponentName(opponent.name) === ownKey) {
    return null;
  }

  const addressText =
    descriptionField(event.description, "Adresse") || event.location;
  return {
    opponentName: opponent.name,
    opponentTeamNo: opponent.teamNo,
    homeAway,
    opponentAddress:
      homeAway === "auswaerts" ? parseAddress(addressText) : null,
    rawOpponentName,
    venueName: parsedVenueName,
  };
}
