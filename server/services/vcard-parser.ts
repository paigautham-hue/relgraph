/**
 * Minimal vCard 2.1 / 3.0 / 4.0 parser.
 *
 * Goal: pull the handful of fields RelGraph actually uses (FN, ORG, TITLE,
 * EMAIL, TEL) and ignore everything else. No external dependency.
 *
 * Why in-house: the existing libraries (vcards-js, ical.js) are 30-100 KB
 * and 90% of their surface is unused. Our use case — paste/drop a vCard
 * file from a conference contact — needs ~50 lines.
 *
 * Limitations (acceptable for v1):
 *   - Doesn't handle line continuations (multi-line values with leading space)
 *   - Doesn't decode quoted-printable or base64 photos
 *   - Doesn't parse structured N (last;first;middle) — only FN
 *   - Honors first BEGIN:VCARD..END:VCARD per card; multi-card files OK
 */

export interface ParsedVCard {
  fullName: string | null;
  organization: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Parse a vCard payload (single card OR multi-card file). Returns one
 * ParsedVCard per BEGIN:VCARD..END:VCARD block; entries with no FN are
 * still included so the caller can decide whether to drop them.
 */
export function parseVCardText(text: string): ParsedVCard[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const cards: ParsedVCard[] = [];

  const blocks = splitIntoCards(normalized);
  for (const block of blocks) {
    cards.push(parseBlock(block));
  }
  return cards;
}

function splitIntoCards(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  let current: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^BEGIN:VCARD/i.test(line)) {
      current = [];
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      if (current && current.length > 0) blocks.push(current.join("\n"));
      current = null;
      continue;
    }
    if (current !== null) current.push(line);
  }
  return blocks;
}

function parseBlock(block: string): ParsedVCard {
  const result: ParsedVCard = {
    fullName: null,
    organization: null,
    title: null,
    email: null,
    phone: null,
  };

  // Unfold line continuations (RFC 6350): subsequent lines starting with space
  // are continuations of the previous line.
  const lines: string[] = [];
  for (const line of block.split("\n")) {
    if (lines.length > 0 && /^\s/.test(line)) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  for (const line of lines) {
    if (!line.trim()) continue;

    // A vCard line is `PROPERTY[;PARAMS]:VALUE`. We split on first unescaped colon.
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const left = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trim();
    if (!value) continue;

    // Strip params: take only the property name (before first semicolon).
    const semiIdx = left.indexOf(";");
    const property = (semiIdx >= 0 ? left.slice(0, semiIdx) : left).trim().toUpperCase();

    switch (property) {
      case "FN":
        if (!result.fullName) result.fullName = unescapeVCardValue(value);
        break;
      case "N":
        // N is structured: "lastName;firstName;additional;prefix;suffix"
        // Only used as fallback if FN missing.
        if (!result.fullName) {
          const parts = value.split(";").map((p) => unescapeVCardValue(p.trim()));
          const [last, first] = parts;
          const joined = `${first ?? ""} ${last ?? ""}`.trim();
          if (joined) result.fullName = joined;
        }
        break;
      case "ORG":
        if (!result.organization) {
          // ORG is semicolon-delimited (organization;department); take the
          // first. The split MUST respect escaped semicolons (\;), so we
          // do it manually rather than `value.split(";")`.
          const orgPart = splitOnUnescapedSemicolon(value)[0]?.trim();
          if (orgPart) result.organization = unescapeVCardValue(orgPart);
        }
        break;
      case "TITLE":
        if (!result.title) result.title = unescapeVCardValue(value);
        break;
      case "EMAIL":
        if (!result.email) result.email = value.trim();
        break;
      case "TEL":
        if (!result.phone) result.phone = value.trim();
        break;
    }
  }

  return result;
}

/**
 * Split on `;` that isn't preceded by `\`. Used by ORG and N which are
 * semicolon-delimited structured values where the parts themselves may
 * contain escaped semicolons.
 */
function splitOnUnescapedSemicolon(value: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      buffer += ch + value[i + 1];
      i++;
      continue;
    }
    if (ch === ";") {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  parts.push(buffer);
  return parts;
}

function unescapeVCardValue(value: string): string {
  // RFC 6350 §3.4: backslash-escape for comma, semicolon, backslash, newline.
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}
