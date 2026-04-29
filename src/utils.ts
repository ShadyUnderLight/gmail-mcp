import { AddressObject } from "./types.js";

export function parseAddresses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((a) => a.trim()).filter(Boolean);
}

export function formatAddresses(addresses: AddressObject[]): string {
  return addresses.map((a) => {
    const name = a.name || a.displayName;
    if (name && name !== a.address) {
      return `${name} <${a.address}>`;
    }
    return a.address || "";
  }).filter(Boolean).join(", ");
}

export function extractEmailAddress(from: string | undefined): string {
  if (!from) return "unknown";
  const match = from.match(/<?([^@\s]+@[^@\s]+)>?/);
  return match ? match[1] : from;
}

export function getHeader(headers: Array<{ name?: string | null; value?: string | null }> | undefined | null, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}
