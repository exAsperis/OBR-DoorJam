import OBR from "@owlbear-rodeo/sdk";
import { setupContextMenu } from "./contextMenu/actions";
import { synchronizeFromItems, synchronizeScene } from "./doorJam/synchronization";
import { setupDoorJamTool } from "./tool/actions";

let cleanup: (() => void) | undefined;
let configuredRole: "GM" | "PLAYER" | undefined;

async function configureForRole() {
  cleanup?.();
  cleanup = undefined;
  const role = await OBR.player.getRole();
  configuredRole = role;
  if (role !== "GM") return;
  const removeMenus = await setupContextMenu();
  const removeTool = await setupDoorJamTool();
  let removeItems: (() => void) | undefined;
  const attachSceneListener = async (ready: boolean) => {
    removeItems?.(); removeItems = undefined;
    if (!ready) return;
    await synchronizeScene();
    removeItems = OBR.scene.items.onChange((items) => void synchronizeFromItems(items).catch(() => undefined));
  };
  const removeReady = OBR.scene.onReadyChange((ready) => void attachSceneListener(ready).catch(() => undefined));
  await attachSceneListener(await OBR.scene.isReady());
  cleanup = () => { removeMenus(); removeTool(); removeReady(); removeItems?.(); };
}

OBR.onReady(async () => {
  await configureForRole();
  OBR.player.onChange((player) => {
    if (player.role !== configuredRole) void configureForRole().catch(() => undefined);
  });
});
