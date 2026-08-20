const paths = {
  home:<><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6"/></>,
  products:<><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></>,
  stock:<><path d="M4 5h16v15H4zM8 5V3h8v2M8 10h8M8 14h5"/></>,
  sales:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M8 8h8M8 12h8M8 16h4"/></>,
  customers:<><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M16 7.5c2.5.3 3.7 1.8 3.7 4.2M16 14c2.8.4 4.3 2.2 4.5 5"/></>,
  coupon:<><path d="M3 8a3 3 0 0 0 0 6v4h18v-4a3 3 0 0 0 0-6V4H3v4Z"/><path d="M12 7v2M12 12v2M12 17v1"/></>,
  pos:<><path d="M4 4h16v12H4zM7 20h10M12 16v4"/><path d="M8 8h8M8 12h5"/></>,
  cash:<><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></>,
  finance:<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  reports:<><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 6 6-4 6 3 5-3"/></>,
  logistics:<><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  heart:<><path d="M20.8 5.8c-2.2-2.3-5.8-2-7.8.5L12 7.5l-1-1.2c-2-2.5-5.6-2.8-7.8-.5-2.3 2.4-2.1 6.2.2 8.5L12 22l8.6-7.7c2.3-2.3 2.5-6.1.2-8.5Z"/></>,
  people:<><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.3-4 2.1-6 5.5-6s5.2 2 5.5 6M14 15c4-.6 6.5 1.1 7 5"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  shield:<><path d="M12 3 4.5 6v5.5c0 4.6 3 8.2 7.5 9.5 4.5-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  bell:<><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  chevron:<path d="m9 7 5 5-5 5"/>,
  menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
  trend:<><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
};

export default function Icon({name,size=18,className=''}) {
  return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.products}</svg>;
}
