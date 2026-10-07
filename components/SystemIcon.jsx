const aliases={
  '🏠':'home','🛍️':'bag','📦':'box','🏷️':'tag','📥':'inbox','👥':'users','🧾':'receipt','↩️':'return',
  '🚚':'truck','🎟️':'ticket','⚙️':'settings','🛒':'cart','💵':'cash','💳':'card','📊':'chart','📈':'trend',
  '👤':'user','💚':'heart','🧑‍💼':'briefcase','🗂️':'folder','⏱️':'clock','🛡️':'shield','🔌':'plug','↗':'external',
  '☰':'menu','×':'close'
};

export default function SystemIcon({name,size=18}){
  const icon=aliases[name]||name;
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
  const shape=(()=>{
    switch(icon){
      case 'home': return <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.2V21h13V9.2"/><path d="M9.5 21v-7h5v7"/></>;
      case 'bag': return <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>;
      case 'box': return <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></>;
      case 'tag': return <><path d="M4 4h7l9 9-7 7-9-9V4Z"/><circle cx="8" cy="8" r="1"/></>;
      case 'inbox': return <><path d="M4 4h16v16H4V4Z"/><path d="M4 14h5l1.5 2h3L15 14h5"/><path d="M12 7v6"/><path d="m9.5 10.5 2.5 2.5 2.5-2.5"/></>;
      case 'users': return <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-3.4 2.3-5 5.5-5s5.1 1.6 5.5 5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.5c3.2-.4 5 1.1 5.3 4.5"/></>;
      case 'receipt': return <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>;
      case 'return': return <><path d="M9 7 4 12l5 5"/><path d="M5 12h9a6 6 0 0 1 6 6v1"/></>;
      case 'truck': return <><path d="M3 6h11v10H3V6Z"/><path d="M14 10h4l3 3v3h-7v-6Z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>;
      case 'ticket': return <><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><path d="M12 8v2M12 14v2"/></>;
      case 'settings': return <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></>;
      case 'cart': return <><path d="M3 4h2l2.2 10h9.8l2-7H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></>;
      case 'cash': return <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9h1M17 15h1"/></>;
      case 'card': return <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></>;
      case 'chart': return <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>;
      case 'trend': return <><path d="M3 18 9 12l4 4 8-10"/><path d="M16 6h5v5"/></>;
      case 'user': return <><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4.5 3.2-6.5 7.5-6.5s6.8 2 7.5 6.5"/></>;
      case 'heart': return <path d="M12 20S4 15.2 4 9.3C4 6.5 6 5 8.2 5c1.6 0 3 1 3.8 2.2C12.8 6 14.2 5 15.8 5 18 5 20 6.5 20 9.3 20 15.2 12 20 12 20Z"/>;
      case 'briefcase': return <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/></>;
      case 'folder': return <path d="M3 6h7l2 2h9v11H3V6Z"/>;
      case 'clock': return <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>;
      case 'shield': return <><path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>;
      case 'plug': return <><path d="M8 3v5M16 3v5M6 8h12v2a6 6 0 0 1-6 6v5M9 21h6"/></>;
      case 'external': return <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/></>;
      case 'search': return <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>;
      case 'bell': return <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>;
      case 'camera': return <><path d="M4 7h4l1.5-2h5L16 7h4v12H4V7Z"/><circle cx="12" cy="13" r="3"/></>;
      case 'logout': return <><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M9 12h8"/></>;
      case 'lock': return <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>;
      case 'pin': return <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>;
      case 'cycle': return <><path d="M7 7h8a5 5 0 0 1 5 5v1"/><path d="m17 10 3 3 3-3"/><path d="M17 17H9a5 5 0 0 1-5-5v-1"/><path d="m7 14-3-3-3 3"/></>;
      case 'menu': return <><path d="M4 7h16M4 12h16M4 17h16"/></>;
      case 'close': return <path d="m6 6 12 12M18 6 6 18"/>;
      default: return <circle cx="12" cy="12" r="8"/>;
    }
  })();
  return <svg {...common}>{shape}</svg>;
}
