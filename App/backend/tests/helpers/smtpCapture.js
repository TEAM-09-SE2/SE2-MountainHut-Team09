// Minimal SMTP server for end-to-end tests: it accepts every message and stores it,
// already decoded, in an in-memory inbox.
import net from "node:net";

import { decodeQuotedPrintable } from "./emailText.js";

function decodeHeader(value) {
  return value.replace(/=\?utf-8\?Q\?(.*?)\?=/gi, (_, text) => decodeQuotedPrintable(text.replace(/_/g, " ")));
}

function decodeBody(headers, body) {
  if (/Content-Transfer-Encoding: quoted-printable/i.test(headers)) return decodeQuotedPrintable(body);
  if (/Content-Transfer-Encoding: base64/i.test(headers)) return Buffer.from(body, "base64").toString("utf8");
  return Buffer.from(body, "latin1").toString("utf8");
}

function parseEmail(raw) {
  const headers = raw.slice(0, raw.indexOf("\r\n\r\n")).replace(/\r\n[ \t]+/g, " ");
  const header = (name) => decodeHeader(headers.match(new RegExp(`^${name}: (.*)$`, "im"))[1]);
  const boundary = headers.match(/boundary="([^"]+)"/)[1];
  const parts = raw.split(`--${boundary}`).slice(1, -1).map((part) => {
    const separator = part.indexOf("\r\n\r\n");
    return { headers: part.slice(0, separator), body: decodeBody(part.slice(0, separator), part.slice(separator + 4)) };
  });
  const body = (type) => parts.find((part) => part.headers.includes(`Content-Type: ${type}`))?.body;
  return { headers: { from: header("From"), to: header("To"), subject: header("Subject") }, html: body("text/html"), text: body("text/plain") };
}

// Creates the SMTP server (not listening yet) and the inbox it fills.
// Each email in the inbox is { from, to, headers: { from, to, subject }, html, text }.
export function createSmtpCapture() {
  const inbox = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let envelope = { from: null, to: [] };
    let dataLines = null;
    const reply = (line) => socket.write(`${line}\r\n`);

    socket.on("error", () => {});
    reply("220 localhost ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      let end;
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);

        if (dataLines) {
          if (line === ".") {
            inbox.push({ ...envelope, ...parseEmail(dataLines.join("\r\n")) });
            dataLines = null;
            reply("250 OK");
          } else {
            dataLines.push(line.startsWith(".") ? line.slice(1) : line);
          }
          continue;
        }

        const command = line.slice(0, 4).toUpperCase();
        if (command === "MAIL") envelope = { from: line.match(/<([^<>]*)>/)[1], to: [] };
        if (command === "RCPT") envelope.to.push(line.match(/<([^<>]*)>/)[1]);
        if (command === "DATA") {
          dataLines = [];
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (command === "QUIT") {
          reply("221 Bye");
          socket.end();
        } else {
          reply("250 OK");
        }
      }
    });
  });
  return { server, inbox };
}
