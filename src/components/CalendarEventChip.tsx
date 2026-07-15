"use client";

import { useState } from "react";
import Link from "next/link";
import { RsvpButtons } from "@/components/RsvpButtons";
import type { RsvpStatus } from "@/lib/types";

/**
 * Termin-Eintrag im Monatskalender: Klick klappt ein kleines Panel mit
 * Zu-/Absage-Buttons und Details-Link auf.
 */
export function CalendarEventChip({
  eventId,
  title,
  time,
  location,
  chipClass,
  myStatus,
}: {
  eventId: string;
  title: string;
  time: string; // "" = keine Uhrzeit anzeigen
  location: string;
  chipClass: string;
  myStatus: RsvpStatus | null;
}) {
  const [open, setOpen] = useState(false);

  const statusMark =
    myStatus === "yes" ? " ✓" : myStatus === "no" ? " ✗" : myStatus === "maybe" ? " ~" : "";

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`${time ? `${time} Uhr – ` : ""}${title}${location ? ` (${location})` : ""} – antippen für Zu-/Absage`}
        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs hover:opacity-80 ${chipClass}`}
      >
        {time && <span className="font-semibold">{time} </span>}
        {title}
        {statusMark}
      </button>

      {open && (
        <div className="mt-1 space-y-2 rounded-lg border border-border bg-surface p-2 text-xs shadow-lg">
          <p className="font-semibold">{title}</p>
          {(time || location) && (
            <p className="text-muted">
              {time && `${time} Uhr`}
              {time && location ? " · " : ""}
              {location}
            </p>
          )}
          <RsvpButtons eventId={eventId} current={myStatus} />
          <Link
            href={`/mitglieder/termine/${eventId}`}
            className="block text-primary hover:underline"
          >
            Details & Wer kommt? →
          </Link>
        </div>
      )}
    </div>
  );
}
