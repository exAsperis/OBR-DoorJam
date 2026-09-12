import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { useEffect, useState, type CSSProperties } from "react";
import { DOOR_ACTIONS, type DoorActionName } from "../doorJam/actions";
import { CONTEXT_MENU_HEIGHT_CHANNEL } from "../constants";
import { chooseDoorArtwork } from "../doorJam/artwork";
import { doorStateErrorMessage, toggleLinkedDoorState } from "../doorJam/control";
import { linkNearbyDoorOrCreate } from "../doorJam/linking";
import { readDoorJamMetadata, removeDoorJamMetadata, removeFogDoorLink, setDoorLocked } from "../doorJam/metadata";
import { getDoorState } from "../dynamicFog/adapter";
import { applyOwlbearTheme } from "../theme";

export function ContextMenuPanel() {
  const [image, setImage] = useState<Image | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"GM" | "PLAYER" | null>(null);
  const [linked, setLinked] = useState(false);

  const refresh = async () => {
    const currentRole = await OBR.player.getRole();
    setRole(currentRole);
    if (!(await OBR.scene.isReady())) { setImage(null); setLinked(false); return; }
    const selection = await OBR.player.getSelection();
    const [item] = selection?.length === 1 ? await OBR.scene.items.getItems(selection) : [];
    const selectedImage = item && isImage(item) ? item : null;
    setImage(selectedImage);
    const selectedMetadata = selectedImage ? readDoorJamMetadata(selectedImage) : null;
    setLinked(Boolean(selectedMetadata?.fogDoor && (await getDoorState(selectedMetadata.fogDoor)).ok));
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

  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | undefined;
    OBR.onReady(() => {
      if (!active) return;
      const panel = document.querySelector<HTMLElement>(".menu-panel");
      if (!panel) return;
      const report = () => {
        const height = Math.ceil(panel.getBoundingClientRect().height);
        void OBR.broadcast.sendMessage(CONTEXT_MENU_HEIGHT_CHANNEL, { height }, { destination: "LOCAL" });
      };
      observer = new ResizeObserver(report);
      observer.observe(panel);
      report();
    });
    return () => { active = false; observer?.disconnect(); };
  }, [image, linked, role]);

  if (!image) return <div className="menu-message">Select one image to use DoorJam.</div>;
  const metadata = readDoorJamMetadata(image);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); await refresh(); } finally { setBusy(false); } };
  const notify = (message: string, variant: "DEFAULT" | "ERROR" = "DEFAULT") => OBR.notification.show(message, variant);
  const link = () => run(async () => {
    try {
      const result = await linkNearbyDoorOrCreate(image, () => notify("No existing Dynamic Fog door found in range. Attempting to create new Dynamic Fog door."));
      if (!result.ok) { await notify(result.message, "ERROR"); return; }
      await notify(result.outcome === "linked-existing" ? "Door image linked to Dynamic Fog door." : "New Dynamic Fog door created. Door image linked.");
    } catch { await notify("DoorJam could not link this image. Check Dynamic Fog and try again.", "ERROR"); }
  });
  const choose = (state: "open" | "closed") => run(async () => {
    await chooseDoorArtwork(image.id, state);
  });
  const toggle = () => run(async () => {
    const result = await toggleLinkedDoorState(image.id);
    if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR");
  });
  const unlink = () => run(async () => {
    await OBR.scene.items.updateItems([image.id], (items) => {
      const item = items[0];
      if (!item) return;
      const current = readDoorJamMetadata(item);
      if (current) removeFogDoorLink(item, current);
    });
    await notify("Dynamic Fog link removed. DoorJam artwork was preserved.");
  });
  const remove = () => run(async () => {
    await OBR.scene.items.updateItems([image.id], (items) => { if (items[0]) removeDoorJamMetadata(items[0]); });
    await notify("DoorJam door removed. The displayed image was preserved.");
  });
  const lock = () => run(async () => {
    await OBR.scene.items.updateItems([image.id], (items) => {
      const item = items[0];
      if (!item) return;
      const current = readDoorJamMetadata(item);
      if (current) setDoorLocked(item, current, current.locked !== true);
    });
  });

  const actionButton = (action: DoorActionName, onClick: () => Promise<void>, override?: { label: string; icon: string }) => {
    const definition: { label: string; icon: string } = override ?? DOOR_ACTIONS[action];
    return <button key={action} style={{ "--menu-icon": `url(${definition.icon})` } as CSSProperties} disabled={busy} onClick={() => void onClick()}>{definition.label}</button>;
  };

  if (role === "PLAYER") return <main className="menu-panel" aria-label="DoorJam actions">
    {metadata ? actionButton("operate", toggle) : <div className="menu-message">This image is not a DoorJam door.</div>}
  </main>;

  const lockDefinition = metadata?.locked
    ? { label: "Unlock Door", icon: "/locked.svg" }
    : { label: "Lock Door", icon: "/unlocked.svg" };

  return <main className="menu-panel" aria-label="DoorJam actions">
    {!metadata ? <>{actionButton("setOpen", () => choose("open"))}{actionButton("link", link)}</> : <>
      {actionButton("operate", toggle)}
      <button key="lock" style={{ "--menu-icon": `url(${lockDefinition.icon})` } as CSSProperties} disabled={busy} onClick={() => void lock()}>{lockDefinition.label}</button>
      {actionButton("setOpen", () => choose("open"))}
      {actionButton("setClosed", () => choose("closed"))}
      {!linked && actionButton("link", link)}
      {metadata.fogDoor ? actionButton("unlink", unlink) : actionButton("remove", remove)}
    </>}
  </main>;
}
