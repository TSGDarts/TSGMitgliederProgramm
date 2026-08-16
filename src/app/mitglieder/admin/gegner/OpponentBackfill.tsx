"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  backfillNuligaOpponents,
  type OpponentBackfillResult,
} from "./actions";
import { Button, Card, CardBody } from "@/components/ui";

export function OpponentBackfill({
  shouldRun,
  remainingCount,
}: {
  shouldRun: boolean;
  remainingCount: number;
}) {
  const started = useRef(false);
  const [result, setResult] = useState<OpponentBackfillResult | null>(null);
  const [pending, startTransition] = useTransition();

  const runBackfill = useCallback(() => {
    setResult(null);
    startTransition(async () => {
      setResult(await backfillNuligaOpponents());
    });
  }, [startTransition]);

  useEffect(() => {
    if (!shouldRun || started.current) return;
    started.current = true;
    runBackfill();
  }, [runBackfill, shouldRun]);

  if (!shouldRun && remainingCount === 0 && !pending && !result) return null;

  return (
    <Card className="bg-primary/5">
      <CardBody className="space-y-2" aria-live="polite">
        <p className="font-semibold">
          {shouldRun || pending
            ? "🎯 Gegner werden automatisch nachgeholt"
            : "🎯 Gegner-Abgleich prüfen"}
        </p>
        <p
          className={`text-sm ${
            result && !result.ok ? "text-danger" : "text-muted"
          }`}
        >
          {pending
            ? "Die vorhandenen nuLiga-Spieltage werden ausgewertet …"
            : result?.message ??
              (shouldRun
                ? "Die vorhandenen nuLiga-Spieltage werden gleich ausgewertet."
                : `${remainingCount} nuLiga-Termine konnten noch nicht eindeutig zugeordnet werden.`)}
        </p>
        {!pending &&
          ((remainingCount > 0 && !shouldRun) || result?.ok === false) && (
            <Button type="button" variant="secondary" onClick={runBackfill}>
              Erneut prüfen
            </Button>
          )}
      </CardBody>
    </Card>
  );
}
