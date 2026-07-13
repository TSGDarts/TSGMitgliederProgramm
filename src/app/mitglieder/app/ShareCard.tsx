"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card, CardBody, Button } from "@/components/ui";

export function ShareCard({ url, title }: { url: string; title: string }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
    setCanNativeShare(
      typeof navigator !== "undefined" && Boolean(navigator.share),
    );
  }, [url]);

  const text = `${title}: ${url}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(
    `Hallo!\n\nHier ist der Link zu unserer Vereins-App:\n${url}\n\nTipp: Auf der Seite unter „App & Teilen" steht, wie man sie als App aufs Handy holt.`,
  )}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      // Abbruch durch Nutzer – kein Fehler
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="font-semibold">Adresse teilen</h2>
          <p className="text-sm text-muted">
            Schick die App-Adresse an deine Mitspieler – oder lass sie einfach
            den QR-Code scannen.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {qr && (
            <div className="text-center">
              <img
                src={qr}
                alt={`QR-Code zu ${url}`}
                className="h-44 w-44 rounded-lg border border-border bg-white p-2"
              />
              <a
                href={qr}
                download="tsg-dart-app-qr.png"
                className="mt-1 block text-sm text-primary hover:underline"
              >
                QR-Code speichern
              </a>
            </div>
          )}

          <div className="w-full min-w-0 flex-1 space-y-3">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {canNativeShare && (
                <Button type="button" onClick={nativeShare}>
                  Teilen …
                </Button>
              )}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                WhatsApp
              </a>
              <a
                href={mailHref}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
              >
                E-Mail
              </a>
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? "Kopiert!" : "Link kopieren"}
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
