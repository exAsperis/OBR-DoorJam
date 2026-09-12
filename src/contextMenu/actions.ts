import OBR from "@owlbear-rodeo/sdk";
import { CONTEXT_MENU_HEIGHT_CHANNEL, EXTENSION_ID } from "../constants";

const icon = "/icon.svg";
const imageFilter = { min: 1, max: 1, every: [{ key: "type", value: "IMAGE" }] };

export async function setupContextMenu(): Promise<() => void> {
  let height = 258;
  const register = () => OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu`,
    icons: [
      { icon, label: "DoorJam", filter: { ...imageFilter, roles: ["GM"], permissions: ["UPDATE"] } },
      { icon, label: "DoorJam", filter: { ...imageFilter, roles: ["PLAYER"] } },
    ],
    embed: { url: "/context-menu.html", height },
  });
  await register();
  const removeHeightListener = OBR.broadcast.onMessage(CONTEXT_MENU_HEIGHT_CHANNEL, (event) => {
    const value = event.data;
    if (!value || typeof value !== "object") return;
    const nextHeight = Math.ceil(Number((value as { height?: unknown }).height));
    if (!Number.isFinite(nextHeight) || nextHeight < 40 || nextHeight > 400 || nextHeight === height) return;
    height = nextHeight;
    void register();
  });
  return () => { removeHeightListener(); void OBR.contextMenu.remove(`${EXTENSION_ID}/context-menu`); };
}
