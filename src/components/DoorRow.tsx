import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { clearDoorHighlight, showDoorHighlight } from "../doorJam/highlight";
import type { DoorListEntry } from "../hooks/useDoorJamDoors";

interface DoorRowProps {
  door: DoorListEntry;
  busy: boolean;
  message?: string;
  selected?: boolean;
  onRename: (id: string, name: string) => Promise<boolean>;
  onToggle: (door: DoorListEntry) => Promise<void>;
}

export function DoorRow({ door, busy, message, selected = false, onRename, onToggle }: DoorRowProps) {
  const [name, setName] = useState(door.name);
  const [renaming, setRenaming] = useState(false);
  const cancelling = useRef(false);
  useEffect(() => setName(door.name), [door.name]);

  const commitName = async () => {
    if (cancelling.current) { cancelling.current = false; setName(door.name); return; }
    const trimmed = name.trim();
    if (!trimmed || trimmed === door.name) { setName(door.name); return; }
    setRenaming(true);
    if (!(await onRename(door.id, trimmed))) setName(door.name);
    setRenaming(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { cancelling.current = true; setName(door.name); event.currentTarget.blur(); }
  };
  const disabled = busy || renaming || !door.linkValid || (door.state === "closed" && !door.hasOpenArtwork);
  const detail = message || (!door.linkValid ? "Invalid link — relink from the image menu" : door.state === "closed" && !door.hasOpenArtwork ? "Set open artwork from the image menu" : undefined);

  return <li data-door-id={door.id} className={`door-row${selected ? " selected" : ""}`} aria-current={selected ? "true" : undefined} onPointerEnter={() => void showDoorHighlight(door.id)} onPointerLeave={() => void clearDoorHighlight()}>
    <img className="door-thumbnail" src={door.thumbnailUrl} alt="" />
    <div className="door-details">
      <input aria-label={`Name for ${door.name || "unnamed door"}`} className="door-name" value={name} disabled={renaming} onChange={(event) => setName(event.target.value)} onBlur={() => void commitName()} onKeyDown={onKeyDown} />
      {detail && <span className="door-message" role="status">{detail}</span>}
    </div>
    <button className={`state-button ${door.state ?? "invalid"}`} disabled={disabled} onClick={() => void onToggle(door)}>{busy ? "Working…" : door.state === "open" ? "Close" : "Open"}</button>
  </li>;
}
