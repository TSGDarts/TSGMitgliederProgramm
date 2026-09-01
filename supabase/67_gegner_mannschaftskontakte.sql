-- =====================================================================
-- Gegner-Ansprechpartner je Mannschaft + verifizierter Import 2026/27
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

create table if not exists public.opponent_team_contacts (
  id          uuid primary key default gen_random_uuid(),
  opponent_id uuid not null references public.opponents (id) on delete cascade,
  team_no     int not null check (team_no between 1 and 99),
  name        text not null,
  phone       text not null default '',
  email       text not null default '',
  source_url  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (opponent_id, team_no)
);

alter table public.opponent_team_contacts enable row level security;

drop policy if exists "opponent_team_contacts_read"
  on public.opponent_team_contacts;
create policy "opponent_team_contacts_read"
  on public.opponent_team_contacts
  for select using (auth.uid() is not null);

drop policy if exists "opponent_team_contacts_write"
  on public.opponent_team_contacts;
create policy "opponent_team_contacts_write"
  on public.opponent_team_contacts
  for all
  using (public.is_editor())
  with check (public.is_editor());

-- Öffentlich veröffentlichte Mannschaftsverantwortliche aus den sechs
-- Staffelkontaktseiten der Saison MFr 2026/27. Leere E-Mail-/Telefonfelder
-- bedeuten: in nuLiga nicht veröffentlicht. Die Vereinsnamen entsprechen
-- bewusst den bereits vorhandenen Gegner-Datensätzen der App.
insert into public.opponent_team_contacts
  (opponent_id, team_no, name, phone, email, source_url)
select
  opponent.id,
  imported.team_no,
  imported.contact_name,
  imported.phone,
  imported.email,
  imported.source_url
from (
  values
    ($club$Dartdragons Moosbach$club$, 1, $txt$Alexander Dauphin$txt$, $txt$+49 176 20697774$txt$, $txt$Alexander.Dauphin@t-online.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),
    ($club$DC Franken-Power$club$, 2, $txt$Marco Lachmann$txt$, $txt$0175 1694382$txt$, $txt$marcolachmann1981@web.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),
    ($club$Rezat Dart Devils$club$, 1, $txt$Sebastian Klärner$txt$, $txt$015221374500$txt$, $txt$klaerner-sebastian@t-online.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),
    ($club$Kangaroots$club$, 2, $txt$Manfred Knauer$txt$, $txt$017671080624$txt$, $txt$mane9@gmx.net$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),
    ($club$Golden Arrows$club$, 1, $txt$Stefan Ell$txt$, $txt$0175/4612035$txt$, $txt$Stefan.Ell@gmx.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),
    ($club$DSV Nürnberg$club$, 2, $txt$Christopher Deetz$txt$, $txt$015254727865$txt$, $txt$chris.deetz@web.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),
    ($club$Dartverein Erlangen e.V.$club$, 2, $txt$Jonas Benkert$txt$, $txt$01738912811$txt$, $txt$jonas.benkert.3@gmail.com$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),
    ($club$Dartkings Rohr$club$, 1, $txt$Andreas Weinhold$txt$, $txt$017645550555$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211700$url$),

    ($club$Finnigan's Harp Nbg.$club$, 3, $txt$Philipp Polster$txt$, $txt$015758239896$txt$, $txt$Polster734@gmail.com$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211748$url$),
    ($club$DC Tschambolaia$club$, 2, $txt$Bastian Böck$txt$, $txt$+4915168139324$txt$, $txt$Bastian_boeck@web.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211748$url$),
    ($club$Phoenix Deining$club$, 1, $txt$Andreas Wurm$txt$, $txt$015758490535$txt$, $txt$wurma1@web.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211748$url$),
    ($club$DC Alfalter$club$, 1, $txt$Christopher Beck$txt$, $txt$015143255372$txt$, $txt$chrissibeck@t-online.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211748$url$),
    ($club$DC Flying Eagles$club$, 1, $txt$Peter Schindler$txt$, $txt$015125093313$txt$, $txt$Peter.schindler16@gmx.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211748$url$),
    ($club$Kangaroots$club$, 3, $txt$Sven Beyer$txt$, $txt$0151/17691400$txt$, $txt$Sven.Sabine.Beyer@t-online.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211748$url$),
    ($club$BV Bergen$club$, 1, $txt$Jonas Kirschner$txt$, $txt$015159147836$txt$, $txt$jonaskirschner10@gmail.com$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211748$url$),

    ($club$Brucklyn Bulls$club$, 1, $txt$Henrik Bytomski$txt$, $txt$0176 97800649$txt$, $txt$h.bytomski@gmx.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),
    ($club$Blue Bull‘s Winkelhaid$club$, 1, $txt$Jan Pfeufer$txt$, $txt$0151 19171009$txt$, $txt$janpfeufer@gmx.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),
    ($club$Finnigan's Harp Nbg.$club$, 5, $txt$Jonathan Clarke$txt$, $txt$015144335852$txt$, $txt$jonathananthonyclarke@gmail.com$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),
    ($club$DC Franken-Power$club$, 5, $txt$Daniel Grosch$txt$, $txt$+49 1512 3030540$txt$, $txt$DCF-DanielGrosch@gmx.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),
    ($club$TSV Kornburg DartKnights$club$, 1, $txt$Maximilian Schmidt$txt$, $txt$0152 55370426$txt$, $txt$max@kornburg.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),
    ($club$BV Bergen$club$, 2, $txt$Jonathan Hölzel$txt$, $txt$01512/0957391$txt$, $txt$soccer.jozzel@web.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),
    ($club$DSC Hesselberg$club$, 3, $txt$Marcel König$txt$, $txt$+49 1512 3523228$txt$, $txt$bartschmarcel@yahoo.de$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),
    ($club$Golden Arrows$club$, 3, $txt$Julian Rammler$txt$, $txt$01704018901$txt$, $txt$rammler.julian@icloud.com$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?contentType=teamContacts&championship=MFr+2026%2F27&group=211773$url$),

    ($club$Finnigan's Harp Nbg.$club$, 8, $txt$Marcel Möckel$txt$, $txt$017647748018$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$DC Franken-Power$club$, 7, $txt$Fabian Reinold$txt$, $txt$01716280022$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$Rezat Dart Devils$club$, 4, $txt$Max Leidenberger$txt$, $txt$01704630306$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$TSV Flachslanden$club$, 1, $txt$Peter Schuderer$txt$, $txt$0160-4036205$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$SV Viktoria Darts Weigenheim$club$, 2, $txt$Bernd Feist$txt$, $txt$0152-22684093$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$Burgus Bulls Sola$club$, 1, $txt$Martin König$txt$, $txt$0175-6208862$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$Blue Bull‘s Winkelhaid$club$, 3, $txt$Manfred Huber$txt$, $txt$0176-74783692$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$Anarchy 05$club$, 3, $txt$Doris Kress$txt$, $txt$04901726453054$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),
    ($club$Dart Bullseye Bandit`s$club$, 2, $txt$Arno Ebert$txt$, $txt$017662103979$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211749$url$),

    ($club$ASV Fürth e.V.$club$, 4, $txt$Benjamin Borisch$txt$, $txt$0176 61583194$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),
    ($club$DC Alfalter$club$, 3, $txt$Christian Arnold$txt$, $txt$015754855969$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),
    ($club$TSV 66 Mühlstetten e.V.$club$, 2, $txt$Felix Bram$txt$, $txt$015159149998$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),
    ($club$ASV Darters Biberttal$club$, 1, $txt$Christian Franke$txt$, $txt$016096431905$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),
    ($club$Dartfreunde Wassermungenau$club$, 1, $txt$Markus Endner$txt$, $txt$01705106359$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),
    ($club$SV Achteltal Darts$club$, 2, $txt$Patrick Bernhard$txt$, $txt$01578 3022393$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),
    ($club$Red Arrows Vach$club$, 2, $txt$David Lucas Joseph$txt$, $txt$$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),
    ($club$DC Tschambolaia$club$, 7, $txt$Petra Gillhammer$txt$, $txt$0176 90715904$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211752$url$),

    ($club$DC Dröhnland$club$, 1, $txt$Andreas Krachowitzer$txt$, $txt$+49 1515 2011743$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$Anarchy 05$club$, 5, $txt$Georg Truckenbrodt$txt$, $txt$015236662903$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$DSV Nürnberg$club$, 7, $txt$Stefanie Salmen$txt$, $txt$0160 4428008$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$TSV Schnelldorf$club$, 1, $txt$Kevin Köhl$txt$, $txt$015141653746$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$Dartdragons Moosbach$club$, 4, $txt$Matthias Henzler$txt$, $txt$01738774385$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$Nesselbacher Schbigger Syndicat$club$, 1, $txt$Marc Zehelein$txt$, $txt$0173 9175755$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$Rezat Dart Devils$club$, 5, $txt$Paul Wirth$txt$, $txt$0151-52451345$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$TSV 66 Mühlstetten e.V.$club$, 1, $txt$Felix Bram$txt$, $txt$015159149998$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$),
    ($club$Dartschützen$club$, 3, $txt$Michael Dummert-Kerschbaum$txt$, $txt$0178 / 4766533$txt$, $txt$$txt$, $url$https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupInfo?championship=MFr+2026%2F27&contentType=teamContacts&group=211751$url$)
) as imported(opponent_name, team_no, contact_name, phone, email, source_url)
join public.opponents as opponent
  on opponent.name = imported.opponent_name
on conflict (opponent_id, team_no) do update set
  name = excluded.name,
  phone = excluded.phone,
  email = excluded.email,
  source_url = excluded.source_url,
  updated_at = now();
