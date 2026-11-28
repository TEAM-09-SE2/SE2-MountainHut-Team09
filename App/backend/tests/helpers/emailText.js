// Shared helpers to read the content of the emails rendered or sent by the app in tests.

// Returns the text a user would see in an HTML email: no comments, no tags, collapsed spaces.
export function visibleText(html) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^<>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Decodes a quoted-printable string (as used in email bodies and headers) to UTF-8.
export function decodeQuotedPrintable(text) {
  const bytes = text.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}
