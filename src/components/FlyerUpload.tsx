"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_MB = 10;

/**
 * Lädt einen Flyer (Bild oder PDF) direkt in den Supabase-Speicher hoch
 * und legt die fertige Adresse in ein verstecktes Formularfeld.
 */
export function FlyerUpload({ initial = "" }: { initial?: string }) {
  const [url, setUrl] = useState(initial);
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
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from("flyers")
      .upload(path, file, { upsert: false });

    if (error) {
      setStatus("error");
      setMessage(`Upload fehlgeschlagen: ${error.message}`);
      return;
    }

    const { data } = supabase.storage.from("flyers").getPublicUrl(path);
    setUrl(data.publicUrl);
    setStatus("idle");
    setMessage("Flyer hochgeladen ✓");
  }

  return (
    <div className="space-y-1">
      <input type="hidden" name="flyer_url" value={url} />
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={handleChange}
        disabled={status === "uploading"}
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-fg hover:file:opacity-90"
      />
      {url && status === "idle" && !message && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Aktuellen Flyer ansehen
        </a>
      )}
      {status === "uploading" && (
        <p className="text-xs text-muted">Lade hoch …</p>
      )}
      {message && (
        <p
          className={`text-xs ${
            status === "error" ? "text-danger" : "text-ok"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
