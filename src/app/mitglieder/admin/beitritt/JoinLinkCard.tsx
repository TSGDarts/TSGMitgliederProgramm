"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card, CardBody, Button } from "@/components/ui";
import { regenerateTokenAction } from "./actions";

export function JoinLinkCard({ url }: { url: string }) {
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="font-semibold">Beitritts-Link & QR-Code</h2>
          <p className="text-sm text-muted">
            Diesen Link/QR an alle verteilen (z. B. WhatsApp-Gruppe, Aushang).
            Jeder wählt darüber seinen Namen und legt seinen Zugang selbst an.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {qr && (
            <img
              src={qr}
              alt="QR-Code zum Beitreten"
              className="h-40 w-40 rounded-lg border border-border bg-white p-2"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={copy} type="button" variant="secondary">
                {copied ? "Link kopiert!" : "Link kopieren"}
              </Button>
              {qr && (
                <a
                  href={qr}
                  download="tsg-dart-beitritt-qr.png"
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
                >
                  QR-Code speichern
                </a>
              )}
            </div>
          </div>
        </div>

        <form
          action={regenerateTokenAction}
          className="border-t border-border pt-3"
        >
          <p className="mb-2 text-xs text-muted">
            Falls der Link in falsche Hände gerät, kannst du einen neuen erzeugen.
            Achtung: Der alte Link/QR funktioniert dann nicht mehr.
          </p>
          <Button type="submit" variant="ghost" className="text-danger">
            Neuen Link erzeugen (alten ungültig machen)
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
