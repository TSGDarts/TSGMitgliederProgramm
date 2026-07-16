"use client";

import { WhatsAppIcon } from "@/components/WhatsAppIcon";

/**
 * Direkt-Senden-Knöpfe im „Neuer Beitrag“-Formular (Fragen & Feedback):
 * liest die aktuellen Feldwerte aus und öffnet E-Mail bzw. den
 * WhatsApp-Chat der in den Einstellungen hinterlegten Nummer mit dem
 * fertigen Text – ohne den Beitrag in der App zu veröffentlichen.
 */
export function FeedbackSenden({
  email,
  waZiel,
  absender,
}: {
  email: string;
  waZiel: string; // wa.me-Nummer (nur Ziffern), leer = kein Knopf
  absender: string;
}) {
  if (!email && !waZiel) return null;

  const lesen = (form: HTMLFormElement | null) => {
    if (!form) return null;
    const feld = (name: string) =>
      form.elements.namedItem(name) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null;
    const titel = (feld("title")?.value ?? "").trim();
    if (!titel) {
      alert("Bitte zuerst dein Anliegen ins Feld „Frage / Anliegen“ schreiben.");
      return null;
    }
    const details = (feld("body")?.value ?? "").trim();
    const kindSel = feld("kind") as HTMLSelectElement | null;
    const artLabel = kindSel?.selectedOptions[0]?.text ?? "💬 Frage";
    const artText = artLabel.replace(/^[^\p{L}]+/u, "").trim() || "Frage";
    const teamSel = feld("team_id") as HTMLSelectElement | null;
    const bereich = teamSel?.selectedOptions[0]?.text ?? "Gesamter Verein";
    const text = [
      `${artText} von ${absender} (${bereich}):`,
      titel,
      ...(details ? ["", details] : []),
    ].join("\n");
    return { artText, titel, text };
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">
        Oder direkt an den Verein senden (ohne Veröffentlichung hier):
      </span>
      {email ? (
        <button
          type="button"
          onClick={(e) => {
            const d = lesen(e.currentTarget.form);
            if (!d) return;
            window.location.href = `mailto:${email}?subject=${encodeURIComponent(
              `${d.artText}: ${d.titel}`,
            )}&body=${encodeURIComponent(d.text)}`;
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
        >
          ✉️ Per E-Mail
        </button>
      ) : null}
      {waZiel ? (
        <button
          type="button"
          onClick={(e) => {
            const d = lesen(e.currentTarget.form);
            if (!d) return;
            window.open(
              `https://wa.me/${waZiel}?text=${encodeURIComponent(d.text)}`,
              "_blank",
              "noopener",
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <WhatsAppIcon /> Per WhatsApp
        </button>
      ) : null}
    </div>
  );
}
