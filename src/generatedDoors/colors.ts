export function deriveDoorStrokeColor(baseColor: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(baseColor);
  if (!match) return "#34291f";
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.max(18, Math.round(((value >> shift) & 255) * 0.55));
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}
