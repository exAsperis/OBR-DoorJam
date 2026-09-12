export const DOOR_ACTIONS = {
  operate: { label: "Operate Door", icon: "/tool-operate.svg" },
  setOpen: { label: "Set Open Door Image", icon: "/set-open-image.svg" },
  setClosed: { label: "Set Closed Door Image", icon: "/set-closed-image.svg" },
  link: { label: "Link/Relink Dynamic Fog Door", icon: "/tool-link.svg" },
  linkNew: { label: "Link to New Dynamic Fog Door", icon: "/tool-link-to-new.svg" },
  unlink: { label: "Unlink Door", icon: "/tool-unlink.svg" },
} as const;

export type DoorActionName = keyof typeof DOOR_ACTIONS;
