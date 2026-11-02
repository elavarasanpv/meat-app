/** Small stroke icons on a 24-grid, matching the apps' icon style. */
type P = { size?: number; className?: string };
const base = (size = 20, className = "") => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});

export const IconGrid = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></svg>
);
export const IconOrders = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
);
export const IconShop = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M3 9.5 4.5 5h15L21 9.5" /><path d="M3 9.5a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0" /><path d="M4.5 12v8h15v-8" /><path d="M14 20v-6h3.5v6" /></svg>
);
export const IconRider = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17l3-8h5l1 4h3" /><path d="M12 5h3l1 4" /><path d="M9 9H5" /></svg>
);
export const IconCash = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h12.5v3" /><path d="M3.5 7.5v10A2.5 2.5 0 0 0 6 20h14v-9H6a2.5 2.5 0 0 1-2.5-2.5z" /><circle cx="16" cy="15.5" r="1.3" /></svg>
);
export const IconSearch = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);
export const IconBell = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></svg>
);
export const IconSettings = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconLogout = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></svg>
);
export const IconCheck = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IconX = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconClock = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconArrowUp = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></svg>
);
export const IconMap = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
);
export const IconPlus = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconPhone = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
);
export const IconEdit = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
);
export const IconChevron = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconUser = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
);
export const IconUsers = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 13.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>
);
export const IconLock = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
);
export const IconSliders = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const IconHistory = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v4h4" /><path d="M12 8v4l3 2" /></svg>
);
export const IconChevronDown = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M6 9l6 6 6-6" /></svg>
);
export const IconCopy = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></svg>
);
export const IconAlert = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 4 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.01" /></svg>
);
export const IconInfo = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.01" /></svg>
);
export const IconBan = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>
);
export const IconShopOff = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M3 9.5 4.5 5h15L21 9.5" /><path d="M4.5 12v8h15v-8" /><path d="M8 13l8 5M16 13l-8 5" /></svg>
);
export const IconPackage = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></svg>
);
