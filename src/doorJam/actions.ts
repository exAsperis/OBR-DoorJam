export const DOOR_ACTIONS = {
  operate: { label: "Operate Door", icon: "/tool-operate.svg" },
  lock: { label: "Lock/Unlock Door", icon: "/locked.svg" },
  setImages: { label: "Set Images", icon: "/set-open-image.svg" },
  link: { label: "Link/Create Dynamic Fog Door", icon: "/tool-link.svg" },
  linkSmoke: { label: "Link/Create Smoke & Spectre! Door", icon: "/tool-link-smoke.svg" },
  linkStageManager: { label: "Link Stage Manager Elevator", icon: "/tool-link-stage-manager.svg" },
  unlink: { label: "Break Link", icon: "/tool-unlink.svg" },
  remove: { label: "Remove Door", icon: "/remove-door.svg" },
} as const;

export type DoorActionName = keyof typeof DOOR_ACTIONS;
