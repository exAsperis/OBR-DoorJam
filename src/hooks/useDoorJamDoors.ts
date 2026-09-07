import OBR, { isImage, type Item } from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { lookupDoor } from "../dynamicFog/adapter";
import { readDoorJamMetadata } from "../doorJam/metadata";

export interface DoorListEntry {
  id: string;
  name: string;
  thumbnailUrl: string;
  state: "open" | "closed" | null;
  linkValid: boolean;
  hasOpenArtwork: boolean;
}

export function buildDoorListEntries(items: Item[]): DoorListEntry[] {
  return items.filter(isImage).flatMap((image) => {
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return [];
    const linkedDoor = lookupDoor(items, metadata.fogDoor);
    const state: DoorListEntry["state"] = linkedDoor.ok ? (linkedDoor.door.open ? "open" : "closed") : null;
    return [{ id: image.id, name: image.name, thumbnailUrl: image.image.url,
      state,
      linkValid: linkedDoor.ok, hasOpenArtwork: Boolean(metadata.openImage) }];
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

export function useDoorJamDoors(enabled: boolean, sceneReady: boolean) {
  const [doors, setDoors] = useState<DoorListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !sceneReady) {
      if (active.current) { setDoors([]); setError(null); setLoading(false); }
      return;
    }
    setLoading(true);
    try {
      if (await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) {
        if (active.current) setDoors([]);
        return;
      }
      const items = await OBR.scene.items.getItems();
      if (active.current) { setDoors(buildDoorListEntries(items)); setError(null); }
    } catch {
      if (active.current) setError("DoorJam could not read the current scene.");
    } finally { if (active.current) setLoading(false); }
  }, [enabled, sceneReady]);

  const renameDoor = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) return false;
    try {
      let updated = false;
      await OBR.scene.items.updateItems([id], (items) => {
        if (items[0] && readDoorJamMetadata(items[0])) { items[0].name = trimmed; updated = true; }
      });
      if (!updated) return false;
      await refresh();
      return true;
    } catch { return false; }
  }, [refresh]);

  useEffect(() => {
    active.current = true;
    let removeItems: (() => void) | undefined;
    if (enabled && sceneReady) {
      void refresh();
      removeItems = OBR.scene.items.onChange(() => void refresh());
    } else { setDoors([]); setLoading(false); setError(null); }
    return () => { active.current = false; removeItems?.(); };
  }, [enabled, sceneReady, refresh]);

  return { doors, loading, error, refresh, renameDoor };
}
