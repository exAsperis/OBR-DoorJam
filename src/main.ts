import OBR from "@owlbear-rodeo/sdk";
import { DOORJAM_OPERATE_CHANNEL } from "./constants";
import { setupContextMenu } from "./contextMenu/actions";
import { synchronizeFromItems, synchronizeScene } from "./doorJam/synchronization";
import { handlePlayerDoorOperation } from "./doorJam/control";
import { setupDoorOverlays } from "./doorJam/overlays";
import { setupDoorJamTool } from "./tool/actions";

let cleanup: (() => void) | undefined;
let configuredRole: "GM" | "PLAYER" | undefined;

async function configureForRole() {
  cleanup?.();
  cleanup = undefined;
  const role = await OBR.player.getRole();
  configuredRole = role;
  const removeMenus = await setupContextMenu();
  const removeTool = await setupDoorJamTool();
  const removeOverlays = role === "GM" ? await setupDoorOverlays() : undefined;
  let removeItems: (() => void) | undefined;
  let removeOperate: (() => void) | undefined;
  if (role === "GM") {
    removeOperate = OBR.broadcast.onMessage(DOORJAM_OPERATE_CHANNEL, (event) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const { imageId, open } = data as { imageId?: unknown; open?: unknown };
      if (typeof imageId !== "string" || imageId.length > 200 || (open !== undefined && typeof open !== "boolean")) return;
      void handlePlayerDoorOperation(imageId, open as boolean | undefined);
    });
  }
  const attachSceneListener = async (ready: boolean) => {
    removeItems?.(); removeItems = undefined;
    if (!ready || role !== "GM") return;
    await synchronizeScene();
    removeItems = OBR.scene.items.onChange((items) => void synchronizeFromItems(items).catch(() => undefined));
  };
  const removeReady = OBR.scene.onReadyChange((ready) => void attachSceneListener(ready).catch(() => undefined));
  await attachSceneListener(await OBR.scene.isReady());
  cleanup = () => { removeMenus(); removeTool(); removeOverlays?.(); removeReady(); removeItems?.(); removeOperate?.(); };
}

OBR.onReady(async () => {
  await configureForRole();
  OBR.player.onChange((player) => {
    if (player.role !== configuredRole) void configureForRole().catch(() => undefined);
  });
});
