import OBR from "@owlbear-rodeo/sdk";
import { getDoorLinkKinds, readDoorJamMetadata, removeDoorLink, type DoorLinkKind } from "./metadata";
import { INTEGRATION_NAMES } from "./providers";
import { openBreakLinkPopover } from "./breakLinkPopover";

export async function breakDoorLink(imageId: string, kind: DoorLinkKind): Promise<boolean> {
  let removed = false;
  await OBR.scene.items.updateItems([imageId], (items) => {
    const item = items[0]; if (!item) return;
    const metadata = readDoorJamMetadata(item);
    if (!metadata?.links?.[kind]) return;
    removeDoorLink(item, metadata, kind); removed = true;
  });
  if (removed) await OBR.notification.show(`${INTEGRATION_NAMES[kind]} link removed. DoorJam artwork was preserved.`, "DEFAULT");
  return removed;
}
export async function breakDoorLinkInteractive(imageId: string): Promise<void> {
  const item = (await OBR.scene.items.getItems([imageId]))[0];
  if (!item) return;
  const metadata = readDoorJamMetadata(item);
  if (!metadata) return;
  const kinds = getDoorLinkKinds(metadata);
  if (kinds.length === 1) await breakDoorLink(imageId, kinds[0]);
  else if (kinds.length > 1) await openBreakLinkPopover(imageId);
}
