"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_MB = 15;

/**
 * Lädt einen Beleg (Foto oder PDF) in den PRIVATEN Kassen-Speicher hoch und
 * legt den Datei-Pfad + Original-Namen in versteckte Formularfelder. Der
 * Abruf läuft später nur über serverseitig erzeugte Signed-URLs.
 */
export function KasseUpload({
  folder,
  pathField = "file_path",
  nameField = "dateiname",
}: {
  folder: string;
  pathField?: string;
  nameField?: string;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setStatus("error");
      setMessage(`Datei ist zu groß (max. ${MAX_MB} MB).`);
      return;
    }
    setStatus("uploading");
    setMessage("");

    const supabase = createClient();
    const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const p = `${folder}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage
      .from("kasse")
      .upload(p, file, { upsert: false });
    if (error) {
      setStatus("error");
      setMessage(`Upload fehlgeschlagen: ${error.message}`);
      return;
    }
    setPath(p);
    setName(file.name);
    setStatus("idle");
    setMessage(`${file.name} hochgeladen ✓`);
  }

  return (
    <div className="space-y-1">
      <input type="hidden" name={pathField} value={path} />
      <input type="hidden" name={nameField} value={name} />
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={handleChange}
        disabled={status === "uploading"}
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-fg hover:file:opacity-90"
      />
      {status === "uploading" && <p className="text-xs text-muted">Lade hoch …</p>}
      {message && (
        <p className={`text-xs ${status === "error" ? "text-danger" : "text-ok"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
