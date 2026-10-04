/**
 * QRCard - Displays a scannable QR code with download and copy link buttons.
 */
import { useState } from "react";
import { Card, Button } from "./common";
import { Download, Link2 } from "./Icons";

function getQRUrl(data) {
  return "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(data);
}

export default function QRCard({ title, desc, url, filename }) {
  const qrUrl = getQRUrl(url);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadQR = async () => {
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || "qr-code.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      window.open(qrUrl, "_blank");
    }
  };

  return (
    <Card>
      <Card.Body style={{ textAlign: "center" }}>
        <h3 className="qr-card__title">{title}</h3>
        <p className="qr-card__desc">{desc}</p>
        <div style={{ margin: "var(--space-4) auto", padding: "var(--space-3)", background: "#fff", borderRadius: "var(--radius-lg)", display: "inline-block", border: "1px solid var(--color-border)" }}>
          <img src={qrUrl} alt={title} width={200} height={200} style={{ display: "block" }} />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "center", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
          <Button variant="primary" size="sm" onClick={handleDownloadQR}>
            <Download size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />Download QR
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCopyLink}>
            <Link2 size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />{copied ? "Copied!" : "Copy Link"}
          </Button>
        </div>
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-2)", wordBreak: "break-all" }}>{url}</p>
      </Card.Body>
    </Card>
  );
}
