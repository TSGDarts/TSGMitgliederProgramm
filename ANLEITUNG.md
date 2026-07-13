# TSG 08 Roth – Dart: Mitglieder-Website

Eine Website mit **zwei Bereichen**:

- **Öffentlich** (ohne Login): Startseite, Mannschaften, Terminkalender, Kontakt.
- **Mitglieder-/Verwaltungsbereich** (`/mitglieder`, mit Login): Termine mit
  Zu-/Absagen (wie SpielerPlus), Kader je Mannschaft, nuLiga-Tabellen, Fragen,
  Mitglieder- und Mannschaftsverwaltung.

Technik: **Next.js** (Website) + **Supabase** (Datenbank & Login) + **Vercel**
(Hosting). Alles im Vereinsrahmen kostenlos.

---

## Überblick der Einrichtung (einmalig)

1. Supabase-Projekt anlegen und Datenbank einrichten
2. Ersten Admin-Zugang anlegen
3. Website bei GitHub + Vercel online stellen
4. Vereinsdaten anpassen (Name, Kontakt, nuLiga)

Plane dafür ca. 30–45 Minuten ein. Du brauchst **keine** Programmierkenntnisse,
nur Kopieren/Einfügen.

---

## Schritt 1 – Supabase einrichten

1. Auf **https://supabase.com** kostenlos registrieren und ein neues Projekt
   erstellen (Region: **Central EU (Frankfurt)**). Merke dir das
   Datenbank-Passwort.
2. Im Projekt links auf **SQL Editor** → **New query**.
3. Den kompletten Inhalt der Datei **`supabase/schema.sql`** (aus diesem Projekt)
   einfügen und auf **Run** klicken. Damit werden alle Tabellen und
   Zugriffsrechte angelegt.
4. Links auf **Project Settings → API**. Dort findest du drei Werte, die du
   gleich brauchst:
   - **Project URL**
   - **anon public** Schlüssel
   - **service_role** Schlüssel (geheim!)

---

## Schritt 2 – Ersten Admin anlegen

Der allererste Zugang wird von Hand angelegt (danach kannst du alle weiteren
bequem in der Website unter „Mitglieder verwalten“ erstellen):

1. In Supabase links auf **Authentication → Users → Add user → Create new user**.
2. Deine E-Mail eintragen, ein Passwort vergeben und **„Auto Confirm User“**
   aktivieren. **Create user**.
3. Jetzt diesen Nutzer zum Admin machen: links auf **SQL Editor**, neue Query,
   folgendes einfügen (deine E-Mail eintragen) und **Run**:

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Dein Name'
   where email = 'deine@email.de';
   ```

Damit kannst du dich später mit dieser E-Mail + Passwort als Admin einloggen.

---

## Schritt 3 – Website online stellen (GitHub + Vercel)

### 3a. Code zu GitHub

1. Auf **https://github.com** anmelden, **New repository** → Name z. B.
   `tsg-dart`, **Private**, erstellen.
2. Den Inhalt dieses Projektordners in das Repository laden. Am einfachsten mit
   **GitHub Desktop** (https://desktop.github.com): Repository hinzufügen,
   diesen Ordner wählen, „Commit“ und „Push“.

   > Die Datei `.gitignore` sorgt dafür, dass `node_modules` und `.next`
   > **nicht** hochgeladen werden – das ist richtig so.

### 3b. Vercel

1. Auf **https://vercel.com** mit dem GitHub-Konto anmelden.
2. **Add New → Project** → das `tsg-dart`-Repository importieren.
3. Unter **Environment Variables** diese vier Werte eintragen
   (aus Schritt 1 bzw. deine spätere Adresse):

   | Name | Wert |
   |------|------|
   | `NEXT_PUBLIC_SUPABASE_URL` | die Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | der anon-Schlüssel |
   | `SUPABASE_SERVICE_ROLE_KEY` | der service_role-Schlüssel |
   | `NEXT_PUBLIC_SITE_URL` | deine Vercel-Adresse, z. B. `https://tsg-dart.vercel.app` |

4. **Deploy** klicken. Nach ein paar Minuten ist die Seite online.

### 3c. Supabase-Weiterleitungen erlauben (wichtig für Passwort-Links!)

Damit die Einladungs-/Passwort-Links funktionieren:

1. In Supabase → **Authentication → URL Configuration**.
2. **Site URL** = deine Vercel-Adresse (z. B. `https://tsg-dart.vercel.app`).
3. Unter **Redirect URLs** hinzufügen:
   - `https://tsg-dart.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (falls du auch lokal testen willst)

---

## Schritt 4 – Vereinsdaten anpassen

In der Datei **`src/lib/site.ts`** stehen Vereinsname, Kontakt-E-Mail und die
nuLiga-Portaladresse. Einfach dort ändern, committen/pushen – Vercel
aktualisiert automatisch. Die Farben (Vereinsrot) stehen in
`src/app/globals.css` unter `--primary`.

---

## So funktioniert der Alltag

### Neue Mitglieder anlegen (Onboarding wie SpielerPlus)

1. Als Admin einloggen → **Mitglieder verwalten**.
2. Name, E-Mail, Rolle, ggf. Mannschaften wählen → **Zugang anlegen**.
3. Es erscheint ein **Link**. Diesen der Person schicken (WhatsApp/E-Mail).
4. Die Person öffnet den Link und **setzt einmalig ihr eigenes Passwort**.
   Danach loggt sie sich immer mit E-Mail + Passwort ein.

   > Kein E-Mail-Versand nötig – du gibst den Link direkt weiter. Läuft ein
   > Link ab, erzeugst du bei dem Mitglied einfach einen neuen.

### Mannschaften & Kader

**Mannschaften verwalten** → Team anlegen, Liga eintragen, Spieler zum Kader
hinzufügen, Kapitän markieren.

### Termine & Zu-/Absagen

- **Termine verwalten** → Termin für den Verein oder eine Mannschaft anlegen.
- Mitglieder sehen ihre Termine unter **Termine & Zusagen** und geben mit
  einem Klick **Zusage / Vielleicht / Absage** ab. Beim Termin sieht man, wer
  kommt.

### nuLiga

1. Bei einer Mannschaft (**Mannschaften verwalten**) die **nuLiga-Adresse**
   (Tabelle/Spielplan) und die **iCal-Adresse** (Kalender-Export aus nuLiga)
   eintragen und speichern.
2. Auf **„Termine aus nuLiga importieren“** klicken – die Spieltermine landen
   automatisch im Kalender (inkl. Zu-/Absage). Erneut klicken aktualisiert sie.
3. Die Liga-Tabelle wird auf der Mannschaftsseite eingebettet angezeigt.

---

## Lokal testen (optional, nicht nötig für den Betrieb)

Nur falls du auf deinem eigenen Rechner ausprobieren willst:

1. **Node.js** (LTS) von https://nodejs.org installieren.
2. In diesem Ordner die Datei `.env.example` nach `.env.local` kopieren und die
   vier Werte eintragen.
3. Im Ordner ein Terminal öffnen und:
   ```
   npm install
   npm run dev
   ```
4. Browser: http://localhost:3000

---

## Grenzen / gut zu wissen

- **nuLiga**: Es gibt keine offizielle Voll-Synchronisation. Umgesetzt ist der
  offizielle Weg: **iCal-Import** der Termine + **eingebettete** Liga-Seiten.
  Manche nuLiga-Seiten verbieten das Einbetten – dann greift automatisch ein
  „Bei nuLiga öffnen“-Link.
- Der **service_role-Schlüssel** ist geheim und steht nur in den
  Server-Umgebungsvariablen (nie im Browser). Nicht weitergeben.
- Alles Weitere (z. B. E-Mail-Benachrichtigungen bei neuen Terminen,
  Statistiken) lässt sich später ergänzen.
