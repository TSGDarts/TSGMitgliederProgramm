import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { istAusgetreten } from "@/lib/invites";
import { PageHeader, Card, CardBody, Badge, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Geburtstage & Jubiläen" };

// Heutiges Datum in Berlin (JJJJ-MM-TT)
function heuteBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const tagFmt = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "long",
  timeZone: "Europe/Berlin",
});

/** Nächstes Vorkommen (JJJJ-MM-TT) eines Tag-Monats ab heute + Tage bis dahin. */
function naechstes(iso: string, heute: string) {
  const [, mm, dd] = iso.split("-");
  const [hy, hm, hd] = heute.split("-").map(Number);
  let jahr = hy;
  // 29.02. in Nicht-Schaltjahren → 28.02.
  const machDatum = (y: number) => {
    let tag = dd;
    if (mm === "02" && dd === "29") {
      const schalt = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      if (!schalt) tag = "28";
    }
    return `${y}-${mm}-${tag}`;
  };
  let d = machDatum(jahr);
  if (d < `${hy}-${String(hm).padStart(2, "0")}-${String(hd).padStart(2, "0")}`) {
    jahr += 1;
    d = machDatum(jahr);
  }
  const bisTage = Math.round(
    (new Date(d + "T00:00:00Z").getTime() -
      new Date(heute + "T00:00:00Z").getTime()) /
      864e5,
  );
  return { datum: d, jahr, bisTage };
}

const HORIZONT = 92; // Tage im Voraus

export default async function GeburtstagePage() {
  await requireProfile();
  const admin = createAdminSupabase();
  const heute = heuteBerlin();

  const [profRes, invRes] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, birthday, birthday_public, member_since, is_active"),
    admin
      .from("member_invites")
      .select("full_name, birthday, birthday_public, left_on, claimed"),
  ]);

  type Person = {
    name: string;
    birthday: string | null;
    birthday_public: boolean | null;
    member_since?: string | null;
  };
  type ProfRow = {
    full_name: string;
    birthday: string | null;
    birthday_public: boolean | null;
    member_since: string | null;
    is_active: boolean;
  };
  type InvRow = {
    full_name: string;
    birthday: string | null;
    birthday_public: boolean | null;
    left_on: string | null;
    claimed: boolean;
  };
  const personen: Person[] = [
    ...((profRes.data ?? []) as ProfRow[])
      .filter((p) => p.is_active)
      .map((p) => ({
        name: p.full_name,
        birthday: p.birthday,
        birthday_public: p.birthday_public,
        member_since: p.member_since,
      })),
    ...((invRes.data ?? []) as InvRow[])
      .filter((i) => !i.claimed && !istAusgetreten(i.left_on))
      .map((i) => ({
        name: i.full_name,
        birthday: i.birthday,
        birthday_public: i.birthday_public,
      })),
  ];

  // Kommende Geburtstage (nur wer die Anzeige erlaubt hat)
  const geburtstage = personen
    .filter((p) => p.birthday && p.birthday_public)
    .map((p) => {
      const n = naechstes(p.birthday!, heute);
      const alter = n.jahr - Number(p.birthday!.slice(0, 4));
      return { name: p.name, ...n, alter };
    })
    .filter((g) => g.bisTage <= HORIZONT)
    .sort((a, b) => a.bisTage - b.bisTage);

  // Kommende Vereinsjubiläen (aus „Mitglied seit")
  const jubilaeen = personen
    .filter((p) => p.member_since)
    .map((p) => {
      const n = naechstes(p.member_since!, heute);
      const jahre = n.jahr - Number(p.member_since!.slice(0, 4));
      return { name: p.name, ...n, jahre };
    })
    .filter((j) => j.jahre >= 1 && j.bisTage <= HORIZONT)
    .sort((a, b) => a.bisTage - b.bisTage);

  const wann = (bisTage: number, datum: string) =>
    bisTage === 0
      ? "heute 🎉"
      : bisTage === 1
        ? "morgen"
        : `${tagFmt.format(new Date(datum + "T12:00:00Z"))} (in ${bisTage} Tagen)`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="🎂 Geburtstage & Jubiläen"
        subtitle="Die nächsten drei Monate auf einen Blick."
      />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">🎂 Kommende Geburtstage</h2>
        {geburtstage.length === 0 ? (
          <EmptyState
            title="Keine Geburtstage in den nächsten Wochen"
            hint="Es werden nur Geburtstage angezeigt, deren Anzeige im Profil erlaubt ist."
          />
        ) : (
          <div className="space-y-2">
            {geburtstage.map((g, i) => (
              <Card key={`${g.name}-${i}`} className={g.bisTage === 0 ? "border-primary/40 bg-primary/5" : ""}>
                <CardBody className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {g.name}
                    {g.alter % 10 === 0 && (
                      <>
                        {" "}
                        <Badge tone="primary">
                          {g.alter}. – runder Geburtstag! 🎈
                        </Badge>
                      </>
                    )}
                  </span>
                  <span className="text-sm text-muted">
                    wird {g.alter} · {wann(g.bisTage, g.datum)}
                  </span>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">🏅 Kommende Vereinsjubiläen</h2>
        {jubilaeen.length === 0 ? (
          <EmptyState
            title="Keine Jubiläen in den nächsten Wochen"
            hint="Jubiläen erscheinen, sobald beim Mitglied ein „Mitglied seit“-Datum eingetragen ist (Mitglieder verwalten)."
          />
        ) : (
          <div className="space-y-2">
            {jubilaeen.map((j, i) => {
              const rund = j.jahre % 5 === 0 || j.jahre === 1;
              return (
                <Card key={`${j.name}-${i}`} className={j.bisTage === 0 ? "border-primary/40 bg-primary/5" : ""}>
                  <CardBody className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {j.name}
                      {rund && (
                        <>
                          {" "}
                          <Badge tone="ok">{j.jahre} Jahre! 🎊</Badge>
                        </>
                      )}
                    </span>
                    <span className="text-sm text-muted">
                      {j.jahre} Jahre dabei · {wann(j.bisTage, j.datum)}
                    </span>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
