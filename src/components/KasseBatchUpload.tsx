"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveBelegeBatch } from "@/app/mitglieder/kasse/actions";
import { Button, Field, inputClass } from "@/components/ui";

const MAX_MB = 15;

interface Hochgeladen {
  name: string;
  path: string;
  status: "lädt" | "ok" | "fehler";
  fehler?: string;
}

/**
 * Mehrere Rechnungen auf einmal in den privaten Kassen-Speicher laden und
 * gesammelt als Belege anlegen (gemeinsamer Empfänger + Kategorie, Titel =
 * Dateiname). Ideal für einen Schwung PDFs (z. B. alle 2K-Rechnungen).
 */
export function KasseBatchUpload() {
  const router = useRouter();
  const [empfaenger, setEmpfaenger] = useState("2K Dart-Software");
  const [kategorie, setKategorie] = useState("Software");
  const [dateien, setDateien] = useState<Hochgeladen[]>([]);
  const [meldung, setMeldung] = useState("");
  const [pending, start] = useTransition();

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setMeldung("");
    const supabase = createClient();

    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setDateien((d) => [
          ...d,
          { name: file.name, path: "", status: "fehler", fehler: `> ${MAX_MB} MB` },
        ]);
        continue;
      }
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `belege/${crypto.randomUUID()}-${safe}`;
      setDateien((d) => [...d, { name: file.name, path, status: "lädt" }]);
      const { error } = await supabase.storage
        .from("kasse")
        .upload(path, file, { upsert: false });
      setDateien((d) =>
        d.map((x) =>
          x.path === path
            ? {
                ...x,
                status: error ? "fehler" : "ok",
                fehler: error?.message,
              }
            : x,
        ),
      );
    }
    e.target.value = "";
  }

  const fertige = dateien.filter((d) => d.status === "ok");

  function speichern() {
    setMeldung("");
    start(async () => {
      const res = await saveBelegeBatch(
        fertige.map((d) => ({ path: d.path, name: d.name })),
        empfaenger,
        kategorie,
      );
      setMeldung(res.message ?? "");
      if (res.ok) {
        setDateien([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empfänger/Firma (für alle)">
          <input
            value={empfaenger}
            onChange={(e) => setEmpfaenger(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Kategorie (für alle)">
          <input
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field
        label="Dateien auswählen (mehrere möglich)"
        hint="Bilder oder PDFs, je max. 15 MB. Der Titel wird aus dem Dateinamen übernommen."
      >
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleChange}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-fg hover:file:opacity-90"
        />
      </Field>

      {dateien.length > 0 && (
        <ul className="space-y-1 text-sm">
          {dateien.map((d, i) => (
            <li key={`${d.path}-${i}`} className="flex items-center gap-2">
              <span>
                {d.status === "lädt" ? "⏳" : d.status === "ok" ? "✓" : "⚠️"}
              </span>
              <span className="min-w-0 truncate">{d.name}</span>
              {d.fehler && <span className="text-danger">– {d.fehler}</span>}
            </li>
          ))}
        </ul>
      )}

      {meldung && (
        <p
          className={`text-sm ${
            meldung.startsWith("✓") ? "text-ok" : "text-danger"
          }`}
        >
          {meldung}
        </p>
      )}

      <Button
        type="button"
        onClick={speichern}
        disabled={pending || fertige.length === 0}
      >
        {pending
          ? "Speichert …"
          : `${fertige.length} Rechnung${fertige.length === 1 ? "" : "en"} speichern`}
      </Button>
    </div>
  );
}
