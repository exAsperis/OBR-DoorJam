import OBR, { isImage } from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useState } from "react";
import { getDynamicFogDoors, lookupDoor } from "../dynamicFog/adapter";
import { readDoorJamMetadata } from "../doorJam/metadata";

export interface DoorJamStatus {
  loading: boolean;
  dynamicFogDoors: number;
  linkedImages: number;
  invalidLinks: number;
  refresh: () => Promise<void>;
}

export function useDoorJamStatus(enabled: boolean): DoorJamStatus {
  const [loading, setLoading] = useState(false);
  const [dynamicFogDoors, setDynamicFogDoors] = useState(0);
  const [linkedImages, setLinkedImages] = useState(0);
  const [invalidLinks, setInvalidLinks] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) { setDynamicFogDoors(0); setLinkedImages(0); setInvalidLinks(0); return; }
    setLoading(true);
    try {
      const [doors, items] = await Promise.all([getDynamicFogDoors(), OBR.scene.items.getItems()]);
      const links = items.filter(isImage).map((item) => ({ item, metadata: readDoorJamMetadata(item) })).filter((entry) => entry.metadata !== null);
      setDynamicFogDoors(doors.length);
      setLinkedImages(links.length);
      setInvalidLinks(links.filter(({ metadata }) => metadata && !lookupDoor(items, metadata.fogDoor).ok).length);
    } finally { setLoading(false); }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { loading, dynamicFogDoors, linkedImages, invalidLinks, refresh };
}
