// Saturated sRGB colors shared by casts, impacts and projectile trails.
// Small warm cores keep the silhouette colorful instead of washing it to white.
export const COMBAT_PALETTES = {
  pang:   {color:0x00e6a0, edge:0xb8ff28, motif:'alchemy'},
  koo:    {color:0xff7508, edge:0xffd329, motif:'guard'},
  bang:   {color:0x962cff, edge:0xff38cb, motif:'shadow'},
  park:   {color:0xff4908, edge:0xffc400, motif:'forge'},
  jung:   {color:0xffc400, edge:0x3485ff, motif:'dawn'},
  cha:    {color:0x00caff, edge:0x3170ff, motif:'wind'},
  sagong: {color:0xffcd05, edge:0x9d36ff, motif:'astral'},
  cho:    {color:0x65e600, edge:0x00ba6b, motif:'wild'},
  kim:    {color:0xc332ff, edge:0xff3aa4, motif:'arcane'},
  lee:    {color:0xff309b, edge:0x00edcd, motif:'music'},
  choi:   {color:0x00aaff, edge:0x40edff, motif:'ice'},
  flame:  {color:0xff5100, edge:0xffc400, motif:'fire'},
};
export const combatPalette = unit => COMBAT_PALETTES[unit?.def?.id] || {color:unit?.def?.accent ?? 0x00caff, edge:0xffd329, motif:'arcane'};
