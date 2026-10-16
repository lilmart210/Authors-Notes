// Lucide icons (MIT-licensed) inlined as small Solid components — the app's
// single icon set. Ships with the app, works offline. Stroke inherits color.

function base(props, children) {
  return (
    <svg
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.stroke ?? 1.7}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      {children}
    </svg>
  )
}

export const FilesIcon = (props) =>
  base(props, (
    <>
      <path d="M15.5 2H8.6C7.7 2 7 2.7 7 3.6v12.8c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6V6.5z" />
      <path d="M15 2v4.5c0 .8.7 1.5 1.5 1.5H20" />
      <path d="M17 18v2.4c0 .9-.7 1.6-1.6 1.6H5.6C4.7 22 4 21.3 4 20.4V8.6C4 7.7 4.7 7 5.6 7H7" />
    </>
  ))

export const SearchIcon = (props) =>
  base(props, (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </>
  ))

export const UsersIcon = (props) =>
  base(props, (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M15.5 13.4a5.5 5.5 0 0 1 5 5.6" />
    </>
  ))

export const TimelineIcon = (props) =>
  base(props, (
    <>
      <path d="M5 4v16" />
      <circle cx="5" cy="8" r="2" />
      <circle cx="5" cy="16" r="2" />
      <path d="M9 8h11M9 16h7" />
    </>
  ))

export const DatabaseIcon = (props) =>
  base(props, (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.6" />
      <path d="M5 5.5v13c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-13" />
      <path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" />
    </>
  ))

export const SparkleIcon = (props) =>
  base(props, (
    <>
      <rect x="5" y="7" width="14" height="12" rx="3" />
      <path d="M12 7V3.5M9 12h.01M15 12h.01M9.5 16h5M2.5 12H5M19 12h2.5" />
    </>
  ))

export const SettingsIcon = (props) =>
  base(props, (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ))

export const BookIcon = (props) =>
  base(props, (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
    </>
  ))

export const ChevronIcon = (props) =>
  base(props, <path d="M9 6l6 6-6 6" />)

export const ChevronDownIcon = (props) => base(props, <path d="M6 9l6 6 6-6" />)
export const ChevronLeftIcon = (props) => base(props, <path d="M15 18l-6-6 6-6" />)
export const ChevronRightIcon = (props) => base(props, <path d="M9 18l6-6-6-6" />)
export const CircleIcon = (props) => base(props, <circle cx="12" cy="12" r="8" />)
export const CheckCircleIcon = (props) =>
  base(props, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ))

export const PlusIcon = (props) => base(props, <path d="M12 5v14M5 12h14" />)
export const MinusIcon = (props) => base(props, <path d="M5 12h14" />)
export const PanelRightIcon = (props) =>
  base(props, (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ))

export const PageIcon = (props) =>
  base(props, <rect x="5" y="3" width="14" height="18" rx="2" />)

export const ScrollIcon = (props) =>
  base(props, <path d="M4 6h16M4 12h16M4 18h16" />)

export const LockIcon = (props) =>
  base(props, (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ))

export const OpenIcon = (props) =>
  base(props, (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ))

export const GraphIcon = (props) =>
  base(props, (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="7" r="2.4" />
      <circle cx="9" cy="18" r="2.4" />
      <path d="M8.2 7.1l7.4.6M16 9l-6.2 7M7.7 15.7l.9-7.2" />
    </>
  ))

export const TrashIcon = (props) =>
  base(props, (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    </>
  ))

// --- binder ---
export const FolderIcon = (props) => base(props, <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
export const FileTextIcon = (props) =>
  base(props, (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ))
export const ArcIcon = (props) =>
  base(props, (
    <>
      <path d="M4 18c4-9 12-9 16 0" />
      <circle cx="4" cy="18" r="1.6" />
      <circle cx="20" cy="18" r="1.6" />
    </>
  ))
export const QuoteIcon = (props) => base(props, <path d="M10 7H6a2 2 0 0 0-2 2v3h6V7zM10 12c0 3-1.5 5-4 6M20 7h-4a2 2 0 0 0-2 2v3h6V7zM20 12c0 3-1.5 5-4 6" />)
export const LinesIcon = (props) => base(props, <path d="M4 6h16M4 10h16M4 14h10M4 18h13" />)
export const GlobeIcon = (props) =>
  base(props, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ))
export const MoreIcon = (props) =>
  base(props, (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ))
export const PencilIcon = (props) => base(props, <path d="M4 20h4L19 9l-4-4L4 16z" />)
export const CopyIcon = (props) =>
  base(props, (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ))
export const ScissorsIcon = (props) =>
  base(props, (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </>
  ))
export const SendIcon = (props) =>
  base(props, (
    <>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </>
  ))
export const CompareIcon = (props) =>
  base(props, (
    <>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9" />
    </>
  ))
export const RestoreIcon = (props) =>
  base(props, (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ))
export const DownloadIcon = (props) => base(props, <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />)
export const StarIcon = (props) => base(props, <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />)
export const XIcon = (props) => base(props, <path d="M18 6 6 18M6 6l12 12" />)
export const CheckIcon = (props) => base(props, <path d="M5 13l4 4L19 7" />)

// Robot head — the AI models rail button.
export const BotIcon = (props) =>
  base(props, <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 7V3.5M9 12h.01M15 12h.01M9.5 16h5M2.5 12H5M19 12h2.5" /></>)
