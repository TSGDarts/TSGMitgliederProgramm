"use client";

import { useState, useTransition } from "react";
import { setRsvp } from "@/app/mitglieder/termine/actions";
import type { RsvpStatus } from "@/lib/types";

const options: { value: RsvpStatus; label: string; active: string }[] = [
  { value: "yes", label: "Zusage", active: "bg-ok text-white border-ok" },
  { value: "maybe", label: "Vielleicht", active: "bg-warn text-white border-warn" },
  { value: "no", label: "Absage", active: "bg-danger text-white border-danger" },
];

export function RsvpButtons({
  eventId,
  current,
  currentComment = "",
}: {
  eventId: string;
  current: RsvpStatus | null;
  currentComment?: string;
}) {
  const [status, setStatus] = useState<RsvpStatus | null>(current);
  const [comment, setComment] = useState(currentComment);
  const [commentSaved, setCommentSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function choose(value: RsvpStatus) {
    const previous = status;
    setStatus(value); // optimistisch
    setError("");
    setCommentSaved(false);
    startTransition(async () => {
      const res = await setRsvp(eventId, value);
      if (!res.ok) {
        setStatus(previous);
        setError("Konnte nicht gespeichert werden.");
      }
    });
  }

  function saveComment() {
    if (status !== "no" && status !== "maybe") return;
    setError("");
    startTransition(async () => {
      const res = await setRsvp(eventId, status, comment);
      if (!res.ok) {
        setError("Konnte nicht gespeichert werden.");
      } else {
        setCommentSaved(true);
        setTimeout(() => setCommentSaved(false), 2000);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => choose(opt.value)}
            disabled={isPending}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
              status === opt.value
                ? opt.active
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Optionaler Grund bei Absage oder „Vielleicht“ */}
      {(status === "no" || status === "maybe") && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              status === "no"
                ? "Grund (optional), z. B. Schicht, Urlaub …"
                : "Anmerkung (optional), z. B. weiß erst Freitag …"
            }
            className="w-64 max-w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={saveComment}
            disabled={isPending}
            className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-border/40 disabled:opacity-60"
          >
            {commentSaved
              ? "✓ Gespeichert"
              : status === "no"
                ? "Grund speichern"
                : "Anmerkung speichern"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
