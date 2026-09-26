import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { useEffect, useState, type CSSProperties } from "react";
import { CONTEXT_MENU_HEIGHT_CHANNEL } from "../constants";
import { DOOR_ACTIONS, type DoorActionName } from "../doorJam/actions";
import { breakDoorLinkInteractive } from "../doorJam/breakLink";
import { doorStateErrorMessage, toggleLinkedDoorState } from "../doorJam/control";
import { openDoorImagesPopover } from "../doorJam/imagesPopover";
import { linkNearbyDoorOrCreate } from "../doorJam/linking";
import { countDoorLinks, readDoorJamMetadata, removeDoorJamMetadata, setDoorLocked } from "../doorJam/metadata";
import { INTEGRATION_NAMES } from "../doorJam/providers";
import { discoverAndLinkStageManager } from "../stageManager/linking";
import { applyOwlbearTheme } from "../theme";
import { DEFAULT_TOOL_PREFERENCES, readToolPreferences, type DoorJamToolPreferences } from "../tool/preferences";

export function ContextMenuPanel() {
  const [image, setImage] = useState<Image | null>(null); const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"GM" | "PLAYER" | null>(null);
  const [preferences, setPreferences] = useState<DoorJamToolPreferences>(DEFAULT_TOOL_PREFERENCES);
  const refresh = async () => {
    setRole(await OBR.player.getRole()); setPreferences(readToolPreferences(await OBR.player.getMetadata()));
    if (!(await OBR.scene.isReady())) return setImage(null);
    const selection = await OBR.player.getSelection(); const [item] = selection?.length === 1 ? await OBR.scene.items.getItems(selection) : [];
    setImage(item && isImage(item) ? item : null);
  };
  useEffect(() => { let active = true; let removeTheme: (() => void) | undefined; let removePlayer: (() => void) | undefined; let removeItems: (() => void) | undefined;
    OBR.onReady(async () => { if (!active) return; applyOwlbearTheme(await OBR.theme.getTheme()); removeTheme = OBR.theme.onChange(applyOwlbearTheme);
      removePlayer = OBR.player.onChange(() => void refresh()); removeItems = OBR.scene.items.onChange(() => void refresh()); await refresh(); });
    return () => { active = false; removeTheme?.(); removePlayer?.(); removeItems?.(); }; }, []);
  useEffect(() => { let observer: ResizeObserver | undefined; OBR.onReady(() => { const panel = document.querySelector<HTMLElement>(".menu-panel"); if (!panel) return;
    const report = () => void OBR.broadcast.sendMessage(CONTEXT_MENU_HEIGHT_CHANNEL, { height: Math.ceil(panel.getBoundingClientRect().height) }, { destination: "LOCAL" });
    observer = new ResizeObserver(report); observer.observe(panel); report(); }); return () => observer?.disconnect(); }, [image, role, preferences]);
  if (!image) return <div className="menu-message">Select one image to use DoorJam.</div>;
  const metadata = readDoorJamMetadata(image);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); await refresh(); } finally { setBusy(false); } };
  const notify = (message: string, variant: "DEFAULT" | "ERROR" = "DEFAULT") => OBR.notification.show(message, variant);
  const link = (provider: "dynamic-fog" | "smoke") => run(async () => {
    const label = provider === "smoke" ? "Smoke & Spectre!" : "Dynamic Fog";
    const result = await linkNearbyDoorOrCreate(image, () => notify(`No existing ${label} door found in range. Attempting safe creation.`), provider);
    if (!result.ok) return void await notify(result.message, "ERROR");
    await notify(result.warning ? `Door linked, but ${label} could not synchronize its initial state.` : result.outcome === "linked-existing" ? `Door image linked to ${label}.` : `New ${label} door created and linked.`, result.warning ? "ERROR" : "DEFAULT");
    if (result.needsOpenArtwork) await openDoorImagesPopover(image.id);
  });
  const linkStageManager = () => run(async () => { const result = await discoverAndLinkStageManager(image);
    if (!result.ok) return void await notify(result.message, "ERROR");
    if (!("choosing" in result)) { await notify(result.warning ? "Door linked, but Stage Manager could not update the Elevator." : "Door linked to Stage Manager Elevator.", result.warning ? "ERROR" : "DEFAULT"); if (result.needsOpenArtwork) await openDoorImagesPopover(image.id); }
  });
  const toggle = () => run(async () => { const result = await toggleLinkedDoorState(image.id); if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR"); else if (result.warnings?.length) await notify(`Door changed state, but ${result.warnings.map((warning) => `${INTEGRATION_NAMES[warning.integration]} (${warning.message})`).join(" and ")} could not update.`, "ERROR"); });
  const actionButton = (action: DoorActionName, onClick: () => Promise<void>, override?: { label: string; icon: string }) => {
    const definition = override ?? DOOR_ACTIONS[action]; return <button key={action} style={{ "--menu-icon": `url(${definition.icon})` } as CSSProperties} disabled={busy} onClick={() => void onClick()}>{definition.label}</button>;
  };
  if (role === "PLAYER") return <main className="menu-panel" aria-label="DoorJam actions">{metadata ? actionButton("operate", toggle) : <div className="menu-message">This image is not a DoorJam door.</div>}</main>;
  const commonLinks = <>{preferences.dynamicFog && actionButton("link", () => link("dynamic-fog"))}{preferences.smoke && actionButton("linkSmoke", () => link("smoke"))}{preferences.stageManager && actionButton("linkStageManager", linkStageManager)}</>;
  if (!metadata) return <main className="menu-panel" aria-label="DoorJam actions">{actionButton("setImages", () => run(() => openDoorImagesPopover(image.id)))}{commonLinks}</main>;
  const lockDefinition = metadata.locked ? { label: "Unlock Door", icon: "/locked.svg" } : { label: "Lock Door", icon: "/unlocked.svg" };
  return <main className="menu-panel" aria-label="DoorJam actions">
    {actionButton("operate", toggle)}
    {actionButton("lock", () => run(async () => OBR.scene.items.updateItems([image.id], (items) => { const current = items[0] && readDoorJamMetadata(items[0]); if (items[0] && current) setDoorLocked(items[0], current, !current.locked); })), lockDefinition)}
    {actionButton("setImages", () => run(() => openDoorImagesPopover(image.id)))}{commonLinks}
    {countDoorLinks(metadata) ? actionButton("unlink", () => run(() => breakDoorLinkInteractive(image.id))) : actionButton("remove", () => run(async () => { await OBR.scene.items.updateItems([image.id], (items) => { if (items[0]) removeDoorJamMetadata(items[0]); }); await notify("DoorJam door removed. The displayed image was preserved."); }))}
  </main>;
}
