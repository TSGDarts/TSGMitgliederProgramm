# TSG 08 Roth – Dart

Mitglieder- und Infoportal der Dart-Abteilung: öffentliche Vereinsseite +
Mitglieder-/Verwaltungsbereich mit Login, Zu-/Absagen, Kader, Terminkalender,
nuLiga-Anbindung und Fragen.

👉 **Einrichtung & Bedienung: siehe [ANLEITUNG.md](./ANLEITUNG.md)**

## Technik

- **Next.js 16** (App Router, React 19, TypeScript, Tailwind CSS v4)
- **Supabase** – PostgreSQL-Datenbank, Login/Auth, Zugriffsrechte (RLS)
- **Vercel** – Hosting

## Projektstruktur (Kurzüberblick)

```
supabase/schema.sql        Datenbank-Schema (einmalig in Supabase ausführen)
src/lib/site.ts            Vereinsdaten (Name, Kontakt, nuLiga) – hier anpassen
src/app/(public)/          Öffentliche Seiten
src/app/mitglieder/        Mitglieder-Bereich (Login nötig)
src/app/mitglieder/admin/  Verwaltung (nur Admin)
src/lib/                   Datenbank-Zugriff, Auth, Hilfsfunktionen
```

## Lokale Entwicklung

```bash
cp .env.example .env.local   # Werte aus Supabase eintragen
npm install
npm run dev                  # http://localhost:3000
```
