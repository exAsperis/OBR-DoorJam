import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";

const icon = "/icon.svg";
const imageFilter = { min: 1, max: 1, roles: ["GM" as const], permissions: ["UPDATE" as const], every: [{ key: "type", value: "IMAGE" }] };

export async function setupContextMenu(): Promise<() => void> {
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu`,
    icons: [{ icon, label: "DoorJam", filter: imageFilter }],
    embed: { url: "/context-menu.html", height: 216 },
  });
  return () => { void OBR.contextMenu.remove(`${EXTENSION_ID}/context-menu`); };
}
