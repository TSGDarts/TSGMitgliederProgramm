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
}: {
  eventId: string;
  current: RsvpStatus | null;
}) {
  const [status, setStatus] = useState<RsvpStatus | null>(current);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function choose(value: RsvpStatus) {
    const previous = status;
    setStatus(value); // optimistisch
    setError("");
    startTransition(async () => {
      const res = await setRsvp(eventId, value);
      if (!res.ok) {
        setStatus(previous);
        setError("Konnte nicht gespeichert werden.");
      }
    });
  }

  return (
    <div>
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
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
