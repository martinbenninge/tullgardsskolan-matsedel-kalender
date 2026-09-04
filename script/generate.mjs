import { mkdir, writeFile } from "node:fs/promises";

const RSS_URL =
  "https://skolmaten.se/api/4/rss/week/tullgardsskolan?locale=sv";
const SCHOOL_URL = "https://skolmaten.se/tullgardsskolan";
const OUTPUT_DIR = "docs";

const calendars = [
  {
    fileName: "kott.ics",
    name: "Tullgårdsskolan – Kött",
    type: "meat",
  },
  {
    fileName: "vegetariskt.ics",
    name: "Tullgårdsskolan – Vegetariskt",
    type: "vegetarian",
  },
  {
    fileName: "bada.ics",
    name: "Tullgårdsskolan – Kött & vegetariskt",
    type: "both",
  },
];

function decodeEntities(value) {
  const named = {
    "&amp;": "&",
    "&apos;": "'",
    "&gt;": ">",
    "&lt;": "<",
    "&quot;": '"',
    "&#39;": "'",
  };

  return value
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, entity) => {
      const codePoint = entity.toLowerCase().startsWith("x")
        ? Number.parseInt(entity.slice(1), 16)
        : Number.parseInt(entity, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&(amp|apos|gt|lt|quot);|&#39;/g, (entity) => named[entity]);
}

function contentOf(item, tagName) {
  const match = item.match(
    new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i"),
  );
  if (!match) return "";

  return match[1]
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, "$1")
    .trim();
}

function menuLines(description) {
  return decodeEntities(
    description
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").replace(/,\s*$/, "").trim())
    .filter(Boolean);
}

function parseRss(xml) {
  const items = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    const lines = menuLines(contentOf(match[1], "description"));
    const date = contentOf(match[1], "pubDate");
    if (!date || lines.length === 0) continue;

    items.push({ date, lines });
  }

  return items;
}

function menuForDay(lines) {
  // Tullgårdsskolan's feed uses one line for vegetarian-only days. If it has
  // more than one line, the first is the meat dish and following lines are
  // vegetarian alternatives.
  if (lines.length === 1) {
    return { meat: null, vegetarian: lines[0] };
  }

  return { meat: lines[0], vegetarian: lines.slice(1).join(" · ") };
}

function dateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Could not read date from RSS: ${value}`);
  }

  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("");
}

function nextDate(dateString) {
  const year = Number(dateString.slice(0, 4));
  const month = Number(dateString.slice(4, 6));
  const day = Number(dateString.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("");
}

function icalText(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line) {
  // RFC 5545 limits content lines to 75 octets. Fold conservatively while
  // keeping each Unicode code point intact.
  const encoder = new TextEncoder();
  const folded = [];
  let current = "";
  let currentLength = 0;

  for (const character of line) {
    const characterLength = encoder.encode(character).length;
    if (current && currentLength + characterLength > 73) {
      folded.push(current);
      current = ` ${character}`;
      currentLength = 1 + characterLength;
    } else {
      current += character;
      currentLength += characterLength;
    }
  }

  folded.push(current);
  return folded.join("\r\n");
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventFor(item, type, stamp) {
  const date = dateOnly(item.date);
  const menu = menuForDay(item.lines);
  let summary;
  let description;

  if (type === "meat") {
    if (!menu.meat) return null;
    summary = menu.meat;
    description = `Kött: ${menu.meat}`;
  } else if (type === "vegetarian") {
    summary = menu.vegetarian;
    description = `Vegetariskt: ${menu.vegetarian}`;
  } else {
    summary = menu.meat
      ? `Kött: ${menu.meat} | Vegetariskt: ${menu.vegetarian}`
      : `Vegetariskt: ${menu.vegetarian}`;
    description = menu.meat
      ? `Kött: ${menu.meat}\nVegetariskt: ${menu.vegetarian}`
      : `Vegetariskt: ${menu.vegetarian}`;
  }

  return [
    "BEGIN:VEVENT",
    `UID:tullgardsskolan-${date}-${type}@skolmaten-kalender`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `DTSTART;VALUE=DATE:${date}`,
    `DTEND;VALUE=DATE:${nextDate(date)}`,
    `SUMMARY:${icalText(summary)}`,
    `DESCRIPTION:${icalText(`${description}\nKälla: ${SCHOOL_URL}`)}`,
    `URL:${SCHOOL_URL}`,
    "STATUS:CONFIRMED",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

function calendarFile(calendar, items, stamp) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tullgårdsskolan//Skolmatskalender//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icalText(calendar.name)}`,
    "X-WR-CALDESC:Automatiskt uppdaterad från Skolmaten.se",
  ];

  for (const item of items) {
    const event = eventFor(item, calendar.type, stamp);
    if (event) lines.push(...event);
  }

  lines.push("END:VCALENDAR", "");
  return lines.map(foldLine).join("\r\n");
}

async function main() {
  const argumentsList =
    typeof Deno === "undefined" ? process.argv.slice(2) : Deno.args;
  let xml;

  if (argumentsList.includes("--stdin")) {
    xml =
      typeof Deno === "undefined"
        ? await new Promise((resolve, reject) => {
            let input = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => (input += chunk));
            process.stdin.on("end", () => resolve(input));
            process.stdin.on("error", reject);
          })
        : await new Response(Deno.stdin.readable).text();
  } else {
    const response = await fetch(RSS_URL, {
      headers: { "User-Agent": "TullgardsskolanMatsedelCalendar/1.0" },
    });
    if (!response.ok) {
      throw new Error(`RSS request failed with HTTP ${response.status}`);
    }
    xml = await response.text();
  }

  const items = parseRss(xml);
  if (items.length === 0) {
    throw new Error("RSS feed did not contain any menu items");
  }

  const stamp = utcStamp(new Date());
  const files = calendars.map((calendar) => ({
    ...calendar,
    content: calendarFile(calendar, items, stamp),
  }));

  if (argumentsList.includes("--stdout")) {
    process.stdout.write(files.find((file) => file.fileName === "bada.ics").content);
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all(
    files.map((file) => writeFile(`${OUTPUT_DIR}/${file.fileName}`, file.content)),
  );
  console.log(`Updated ${files.length} calendar files with ${items.length} school days.`);
}

if (typeof Deno === "undefined" || import.meta.main) {
  await main();
}

export { calendarFile, menuForDay, parseRss };
