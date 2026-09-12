export const DOOR_ACTIONS = {
  operate: { label: "Operate Door", icon: "/tool-operate.svg" },
  lock: { label: "Lock/Unlock Door", icon: "/locked.svg" },
  setImages: { label: "Set Images", icon: "/set-open-image.svg" },
  link: { label: "Link Dynamic Fog Door", icon: "/tool-link.svg" },
  unlink: { label: "Unlink Door", icon: "/tool-unlink.svg" },
  remove: { label: "Remove Door", icon: "/remove-door.svg" },
} as const;

export type DoorActionName = keyof typeof DOOR_ACTIONS;
