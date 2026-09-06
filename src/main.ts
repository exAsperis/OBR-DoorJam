import OBR from "@owlbear-rodeo/sdk";
import { setupContextMenu } from "./contextMenu/actions";
import { synchronizeFromItems, synchronizeScene } from "./doorJam/synchronization";

let cleanup: (() => void) | undefined;

async function configureForRole() {
  cleanup?.();
  cleanup = undefined;
  if (await OBR.player.getRole() !== "GM") return;
  const removeMenus = await setupContextMenu();
  let removeItems: (() => void) | undefined;
  const attachSceneListener = async (ready: boolean) => {
    removeItems?.(); removeItems = undefined;
    if (!ready) return;
    await synchronizeScene();
    removeItems = OBR.scene.items.onChange((items) => void synchronizeFromItems(items).catch(() => undefined));
  };
  const removeReady = OBR.scene.onReadyChange((ready) => void attachSceneListener(ready).catch(() => undefined));
  await attachSceneListener(await OBR.scene.isReady());
  cleanup = () => { removeMenus(); removeReady(); removeItems?.(); };
}

OBR.onReady(async () => {
  await configureForRole();
  OBR.player.onChange(() => void configureForRole().catch(() => undefined));
});
