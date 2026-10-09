import { NotificationPanel, type NotificationItem } from "./notification-panel";

/* Portraits are Unsplash photos, cropped to faces by the URL. */
const face = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=128&h=128&q=70`;

const PORTRAITS = {
  sarah: face("photo-1494790108377-be9c29b29330"),
  michael: face("photo-1507003211169-0a1dd7228f2d"),
  emily: face("photo-1438761681033-6461ffad8d80"),
  daniel: face("photo-1500648767791-00dcc994a43e"),
  olivia: face("photo-1544005313-94ddf0286df2"),
} as const;

const ITEMS: NotificationItem[] = [
  {
    id: "n1",
    actor: { name: "Michael Carter", avatar: PORTRAITS.michael },
    kind: "mention",
    body: ["mentioned you in ", { entity: "Design review" }],
    quote: "Can you take the empty states before Thursday?",
    time: "12 min ago",
    context: ["Product", "Q3 roadmap"],
    unread: true,
    following: true,
  },
  {
    id: "n2",
    actor: { name: "Emily Thompson", avatar: PORTRAITS.emily },
    kind: "request",
    body: ["is requesting edit access to ", { entity: "Brand kit" }],
    time: "1 hour ago",
    context: ["Design system"],
    unread: true,
    actions: [
      { id: "approve", label: "Approve", tone: "primary", resolved: "You approved the request" },
      { id: "deny", label: "Deny", resolved: "You denied the request" },
    ],
  },
  {
    id: "n3",
    actor: { name: "Daniel Wilson", avatar: PORTRAITS.daniel },
    kind: "file",
    body: ["uploaded a file to ", { entity: "Launch assets" }],
    attachment: { name: "landing-page-v4.fig", size: "2.4 MB" },
    time: "3 hours ago",
    context: ["Marketing"],
    unread: true,
    following: true,
  },
  {
    id: "n4",
    actor: { name: "Olivia Martinez", avatar: PORTRAITS.olivia },
    kind: "edit",
    body: ["edited ", { entity: "Pricing page" }],
    count: 6,
    time: "Yesterday",
    context: ["Website"],
  },
  {
    id: "n5",
    actor: { name: "Priya Raman" },
    kind: "due",
    body: ["moved the due date of ", { entity: "Mobile push setup" }, " to Sep 12"],
    time: "Yesterday",
    context: ["Product", "Sprint 24"],
    following: true,
  },
  {
    id: "n6",
    actor: { name: "Sarah Anderson", avatar: PORTRAITS.sarah },
    kind: "comment",
    body: ["left a comment on ", { entity: "Search across workspaces" }],
    quote: "Debounce feels good now — 240ms reads as instant.",
    time: "28 Apr",
    context: ["Product"],
  },
  {
    id: "n7",
    actor: { name: "Tom Okafor" },
    kind: "join",
    body: ["joined ", { entity: "Delivery team" }],
    time: "28 Apr",
    context: ["People"],
  },
  {
    id: "n8",
    actor: { name: "Sarah Anderson", avatar: PORTRAITS.sarah },
    kind: "created",
    body: ["created ", { entity: "Northwind Cloud" }],
    time: "29 Mar",
    context: ["Workspace"],
    archived: true,
  },
];

export default function NotificationPanelDemo() {
  return (
    <div className="flex w-full justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-[440px]">
        <NotificationPanel
          items={ITEMS}
          maxHeight={420}
          className="shadow-[0_24px_60px_-18px_rgb(0_0_0/0.18)]"
        />
      </div>
    </div>
  );
}
