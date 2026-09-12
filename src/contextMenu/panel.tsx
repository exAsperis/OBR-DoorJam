import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { useEffect, useState, type CSSProperties } from "react";
import { DOOR_ACTIONS, type DoorActionName } from "../doorJam/actions";
import { chooseDoorArtwork } from "../doorJam/artwork";
import { doorStateErrorMessage, setLinkedDoorState } from "../doorJam/control";
import { linkNearestDoorAndChooseArtwork } from "../doorJam/linking";
import { readDoorJamMetadata, removeDoorJamMetadata } from "../doorJam/metadata";
import { applyOwlbearTheme } from "../theme";

export function ContextMenuPanel() {
  const [image, setImage] = useState<Image | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) { setImage(null); return; }
    const selection = await OBR.player.getSelection();
    const [item] = selection?.length === 1 ? await OBR.scene.items.getItems(selection) : [];
    setImage(item && isImage(item) ? item : null);
  };
  useEffect(() => {
    let active = true;
    let removeTheme: (() => void) | undefined;
    let removePlayer: (() => void) | undefined;
    let removeItems: (() => void) | undefined;
    OBR.onReady(async () => {
      if (!active) return;
      applyOwlbearTheme(await OBR.theme.getTheme());
      if (!active) return;
      removeTheme = OBR.theme.onChange(applyOwlbearTheme);
      removePlayer = OBR.player.onChange(() => void refresh());
      removeItems = OBR.scene.items.onChange(() => void refresh());
      await refresh();
    });
    return () => { active = false; removeTheme?.(); removePlayer?.(); removeItems?.(); };
  }, []);

  if (!image) return <div className="menu-message">Select one image to use DoorJam.</div>;
  const metadata = readDoorJamMetadata(image);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); await refresh(); } finally { setBusy(false); } };
  const notify = (message: string, variant: "DEFAULT" | "ERROR" = "DEFAULT") => OBR.notification.show(message, variant);
  const link = () => run(async () => {
    try {
      const result = await linkNearestDoorAndChooseArtwork(image);
      if (!result.ok) { await notify(result.message, "ERROR"); return; }
      await notify(metadata ? "DoorJam link updated." : "Door linked.");
    } catch { await notify("DoorJam could not link this image. Check Dynamic Fog and try again.", "ERROR"); }
  });
  const choose = (state: "open" | "closed") => run(async () => {
    if (await chooseDoorArtwork(image.id, state)) await notify(`${state === "open" ? "Open" : "Closed"} door artwork saved.`);
  });
  const toggle = () => run(async () => {
    const result = await setLinkedDoorState(image.id, metadata?.renderedState !== "open");
    if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR");
  });
  const unlink = () => run(async () => {
    await OBR.scene.items.updateItems([image.id], (items) => { if (items[0]) removeDoorJamMetadata(items[0]); });
    await notify("DoorJam link removed. Dynamic Fog was not changed.");
  });

  const actionButton = (action: DoorActionName, onClick: () => Promise<void>) => {
    const definition = DOOR_ACTIONS[action];
    return <button key={action} style={{ "--menu-icon": `url(${definition.icon})` } as CSSProperties} disabled={busy} onClick={() => void onClick()}>{definition.label}</button>;
  };

  return <main className="menu-panel" aria-label="DoorJam actions">
    {!metadata ? actionButton("link", link) : <>
      {actionButton("operate", toggle)}
      {actionButton("setOpen", () => choose("open"))}
      {actionButton("setClosed", () => choose("closed"))}
      {actionButton("link", link)}
      {actionButton("unlink", unlink)}
    </>}
  </main>;
}
