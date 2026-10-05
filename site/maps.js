// Site schematics. Each map is drawn in the pixel coordinates of the reference photo it was traced from,
// so bed positions and angles follow the photo. The photos themselves are not published.
// A layout entry is a bed rectangle (top-left x/y, width, height) rotated about its own center.

const NS = 'http://www.w3.org/2000/svg';

export function svgElement(name, attrs, parent) {
  const element = document.createElementNS(NS, name);
  Object.entries(attrs || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (parent) parent.appendChild(element);
  return element;
}

export function addText(parent, text, x, y, className, attrs) {
  const element = svgElement('text', Object.assign({ x, y, class: className }, attrs || {}), parent);
  element.textContent = text;
  return element;
}

// Horizontal bed centered on (cx, cy).
function row(bed, cx, cy, length, thickness, rotation, extra) {
  return { bed, x: cx - length / 2, y: cy - thickness / 2, width: length, height: thickness, rotation, ...extra };
}

// Vertical bed centered on (cx, cy).
function column(bed, cx, cy, length, thickness, rotation, extra) {
  return { bed, x: cx - thickness / 2, y: cy - length / 2, width: thickness, height: length, rotation, ...extra };
}

function numbered(entries) {
  return entries.map((entry, index) => entry(index + 1));
}

function northArrow(map, t, x, y) {
  svgElement('path', { d: `M${x} ${y + 8} L${x} ${y - 25} M${x} ${y - 25} L${x - 7} ${y - 13} M${x} ${y - 25} L${x + 7} ${y - 13}`, class: 'north-arrow' }, map);
  addText(map, t('map.north'), x, y + 24, 'north-label');
}

function polygon(parent, points, className, attrs) {
  return svgElement('polygon', Object.assign({ points, class: className }, attrs || {}), parent);
}

// Splits a label into two balanced lines (at a space when there is one, otherwise mid-string).
function twoLines(text) {
  const words = text.split(' ');
  if (words.length < 2) return [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))];
  let best = 1;
  for (let index = 1; index < words.length; index += 1) {
    const diff = (left) => Math.abs(words.slice(0, left).join(' ').length - words.slice(left).join(' ').length);
    if (diff(index) < diff(best)) best = index;
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/* ---------- Shah (80 beds, drawn from five aerial/reference photos) ---------- */

function shahLayout() {
  const layout = [];
  let bed = 1;
  for (let line = 0; line < 6; line += 1) {
    for (let col = 0; col < 3; col += 1) {
      layout.push({ bed: bed++, x: 150 + col * 125, y: 78 + line * 24, width: 105, height: 14, rotation: 0 });
    }
  }
  for (let line = 0; line < 5; line += 1) {
    for (let col = 0; col < 2; col += 1) {
      layout.push({ bed: bed++, x: 590 + col * 98, y: 83 + line * 25, width: 82, height: 13, rotation: -35 });
    }
  }
  for (let col = 0; col < 21; col += 1) layout.push({ bed: bed++, x: 145 + col * 18.5, y: 250, width: 14, height: 84, rotation: 0 });
  for (let col = 0; col < 21; col += 1) layout.push({ bed: bed++, x: 145 + col * 18.5, y: 360, width: 14, height: 104, rotation: 0 });
  for (let line = 0; line < 10; line += 1) layout.push({ bed: bed++, x: 845, y: 255 + line * 28, width: 72, height: 15, rotation: 0 });
  return layout;
}

function drawShah(map, t) {
  svgElement('rect', { x: 0, y: 0, width: 1000, height: 660, class: 'site-ground' }, map);
  svgElement('path', { d: 'M116 48 L704 39 L891 118 L933 548 L775 616 L205 594 L94 500 Z', class: 'site-boundary' }, map);
  svgElement('path', { d: 'M111 49 L704 40 L890 118 L932 547 L775 615 L205 593 L95 499 Z', class: 'site-boundary-line' }, map);
  northArrow(map, t, 74, 74);
  addText(map, t('map.zoneNorth'), 148, 67, 'zone-label');
  addText(map, t('map.zoneNortheast'), 468, 69, 'zone-label');
  addText(map, t('map.zoneWestUpper'), 145, 240, 'zone-label');
  addText(map, t('map.zoneWestLower'), 145, 350, 'zone-label');
  addText(map, t('map.zoneEast'), 847, 244, 'zone-label');
  const facilities = svgElement('g', { class: 'facilities', 'aria-label': t('map.facilitiesAria') }, map);
  polygon(facilities, '785,90 843,108 835,162 777,146', 'landmark skin-roof');
  polygon(facilities, '785,90 814,99 806,154 777,146', 'skin-roof-blue');
  addText(facilities, t('facility.skinDryer'), 811, 178, 'landmark-label-outside');
  polygon(facilities, '595,228 689,237 680,296 586,286', 'landmark store-roof');
  addText(facilities, t('facility.store'), 637, 263, 'landmark-label');
  svgElement('circle', { cx: 583, cy: 342, r: 38, class: 'landmark landmark-dam' }, facilities);
  svgElement('circle', { cx: 583, cy: 342, r: 30, class: 'dam-waterline' }, facilities);
  addText(facilities, t('facility.dam'), 583, 342, 'landmark-label');
  polygon(facilities, '620,383 751,392 743,528 610,515', 'landmark factory-roof');
  svgElement('line', { x1: 630, y1: 420, x2: 743, y2: 428, class: 'roof-ridge' }, facilities);
  addText(facilities, t('facility.factory'), 681, 456, 'landmark-label');
  polygon(facilities, '772,235 823,238 817,542 765,535', 'long-roof');
  addText(facilities, t('map.washingArea'), 795, 312, 'long-roof-label', { transform: 'rotate(90 795 312)' });
  addText(facilities, t('map.fermentation'), 793, 466, 'long-roof-label', { transform: 'rotate(90 793 466)' });
  polygon(facilities, '526,397 576,399 574,444 523,441', 'landmark small-roof');
  polygon(facilities, '548,462 603,466 599,507 544,503', 'landmark small-roof');
  polygon(facilities, '511,470 542,472 540,510 508,507', 'landmark small-roof');
  addText(facilities, t('map.smallBuildings'), 548, 528, 'minor-label');
}

/* ---------- Bergfrieden (45 beds, traced from one satellite image, 966 x 886 px) ---------- */
// Beds in the lower complex run about 6° clockwise; the upper enclosure about 3°.
// Beds 42, 44 and 45 sit under tree canopy in the photo: their rows are inferred from the row spacing.

function bergfriedenLayout() {
  const upper = [260.5, 280, 293.5, 313, 328, 346.5, 361, 380, 397, 417]
    .map((cy) => (bed) => row(bed, 551, cy, 56, 10, 3));
  const west = [
    [381, 530.3, 171], [374.5, 566.6, 171], [370.5, 603.2, 171], [368.5, 624.4, 171],
    [343.5, 638.3, 135], [341.5, 659.6, 135], [340.5, 673.5, 133], [348, 695.8, 152],
    [343.5, 712.3, 155], [343.5, 729.3, 157], [341, 746.6, 156]
  ].map(([cx, cy, length]) => (bed) => row(bed, cx, cy, length, 10.5, 6));
  const central = [
    [516, 525, 53], [512, 551, 54], [507.5, 574, 57], [548, 599, 142], [485.5, 606.5, 23],
    [519.5, 610.5, 37], [583, 619, 72], [487, 627, 34], [531.5, 631.7, 47],
    [696, 576.6, 148], [695.5, 619, 143], [642.5, 627, 35], [681, 631.6, 30], [667.5, 649.5, 77], [738.5, 658.3, 57]
  ].map(([cx, cy, length]) => (bed) => row(bed, cx, cy, length, 9, 6));
  const south = [
    [616, 714.7, 297], [590, 728, 271], [591.5, 748.6, 276], [597.5, 765.2, 285], [592.5, 785.2, 245],
    [597.5, 802, 255, true], [600, 819.4, 260], [602, 836.5, 258, true], [604, 853.5, 252, true]
  ].map(([cx, cy, length, inferred]) => (bed) => row(bed, cx, cy, length, 10, 6, inferred ? { inferred: true } : {}));
  return numbered([...upper, ...west, ...central, ...south]);
}

function drawBergfrieden(map, t) {
  svgElement('rect', { x: 0, y: 0, width: 966, height: 886, class: 'site-ground' }, map);
  polygon(map, '225,46 236,28 540,4 806,4 870,330 912,600 936,886 225,886', 'site-boundary');
  svgElement('polyline', { points: '225,46 236,28 540,4 806,4 870,330 912,600 936,886', class: 'site-boundary-line' }, map);

  const ground = svgElement('g', { class: 'ground-features' }, map);
  polygon(ground, '397,182 662,190 652,486 400,502', 'yard');
  polygon(ground, '262,503 793,558 783,880 250,812', 'parcel');
  svgElement('path', { d: 'M448 505 L436 880', class: 'track' }, ground);
  svgElement('path', { d: 'M225 120 C262 128 292 190 286 262 C281 328 262 360 268 420 C272 470 252 500 225 512 Z', class: 'canopy' }, ground);
  svgElement('path', { d: 'M660 370 C700 335 790 345 812 392 C832 438 812 498 760 506 C706 514 650 470 652 420 Z', class: 'canopy' }, ground);
  svgElement('path', { d: 'M225 812 C300 800 400 790 470 808 C520 820 560 846 590 886 L225 886 Z', class: 'canopy' }, ground);
  svgElement('path', { d: 'M700 830 C760 800 830 806 900 830 L912 886 L690 886 Z', class: 'canopy' }, ground);
  polygon(ground, '642,58 902,64 906,268 646,262', 'hedge');

  const facilities = svgElement('g', { class: 'facilities', 'aria-label': t('map.facilitiesAria') }, map);
  polygon(facilities, '305,63 330,63 330,180 305,180', 'landmark roof-light');
  polygon(facilities, '330,22 393,24 392,181 329,179', 'landmark factory-roof');
  svgElement('line', { x1: 361, y1: 26, x2: 361, y2: 177, class: 'roof-ridge' }, facilities);
  polygon(facilities, '384,152 446,154 445,180 383,179', 'landmark small-roof');
  polygon(facilities, '481,100 656,107 653,176 479,170', 'landmark factory-roof');
  addText(facilities, t('facility.factory'), 361, 166, 'landmark-label');
  polygon(facilities, '403,195 478,190 482,498 400,500', 'landmark store-roof');
  svgElement('line', { x1: 441, y1: 196, x2: 441, y2: 496, class: 'roof-ridge' }, facilities);
  addText(facilities, t('facility.store'), 441, 345, 'landmark-label', { transform: 'rotate(-90 441 345)' });
  polygon(facilities, '545,528 592,529 591,590 544,589', 'landmark small-roof');
  addText(facilities, t('facility.office'), 568, 514, 'landmark-label-outside');
  polygon(facilities, '296,362 395,362 395,408 296,408', 'landmark roof-light');
  polygon(facilities, '320,292 380,292 380,340 320,340', 'landmark roof-light');
  polygon(facilities, '348,215 392,215 392,284 348,284', 'landmark roof-light');
  addText(facilities, t('map.houses'), 345, 428, 'minor-label');
  polygon(facilities, '718,114 800,112 803,233 720,235', 'landmark roof-warm');
  polygon(facilities, '735,255 785,255 785,342 735,342', 'landmark small-roof');
  polygon(facilities, '782,560 800,562 800,760 782,758', 'landmark small-roof');
  svgElement('rect', { x: 506, y: 246, width: 92, height: 186, rx: 3, class: 'enclosure', transform: 'rotate(3 552 339)' }, facilities);

  northArrow(map, t, 262, 205);
  addText(map, t('map.zoneUpperBeds'), 506, 236, 'zone-label');
  addText(map, t('map.zoneWestRows'), 268, 496, 'zone-label');
  addText(map, t('map.zoneCentral'), 468, 508, 'zone-label');
  addText(map, t('map.zoneSouthRows'), 300, 790, 'zone-label');
}

/* ---------- Tingatinga (25 beds, traced from one satellite image, 514 x 642 px) ---------- */
// 19 beds are visible in the photo (9 north, 10 south, running about 4° off north).
// The remaining 6 sit in a tray outside the east hedge until their positions are known.

function tingatingaLayout() {
  const north = [117, 134.5, 152, 169.5, 187, 204.5, 222, 239.5, 257]
    .map((cx) => (bed) => column(bed, cx, 148, 220, 13, -4));
  const south = [127, 146, 165, 184, 203, 222, 241, 260, 279, 298]
    .map((cx) => (bed) => column(bed, cx, 425, 230, 14, -3.5));
  const tray = [0, 1, 2, 3, 4, 5]
    .map((index) => (bed) => column(bed, 518 + (index % 3) * 28, 368 + Math.floor(index / 3) * 70, 50, 18, 0, { unlocated: true }));
  return numbered([...north, ...south, ...tray]);
}

function drawTingatinga(map, t) {
  svgElement('rect', { x: 0, y: -20, width: 640, height: 680, class: 'site-ground' }, map);
  polygon(map, '88,22 420,12 447,250 468,612 102,616 92,300', 'clearing');
  const ground = svgElement('g', { class: 'ground-features' }, map);
  svgElement('path', { d: 'M60 -20 L92 -20 C84 120 98 300 88 420 C82 520 96 590 92 640 L60 640 Z', class: 'canopy' }, ground);
  svgElement('path', { d: 'M100 640 C140 600 230 592 300 606 C340 614 370 628 380 640 Z', class: 'canopy' }, ground);
  svgElement('polyline', { points: '420,-20 447,250 470,640', class: 'hedge-line' }, ground);
  svgElement('rect', { x: 100, y: 28, width: 168, height: 238, rx: 3, class: 'slab', transform: 'rotate(-4 184 147)' }, ground);
  svgElement('rect', { x: 114, y: 302, width: 198, height: 248, rx: 3, class: 'slab', transform: 'rotate(-3.5 213 426)' }, ground);
  polygon(ground, '330,286 382,288 384,372 331,370', 'gravel');

  const facilities = svgElement('g', { class: 'facilities', 'aria-label': t('map.facilitiesAria') }, map);
  polygon(facilities, '318,76 404,62 432,236 345,250', 'landmark store-roof');
  svgElement('line', { x1: 361, y1: 69, x2: 388, y2: 243, class: 'roof-ridge' }, facilities);
  addText(facilities, t('facility.store'), 375, 156, 'landmark-label', { transform: 'rotate(-81 375 156)' });
  polygon(facilities, '212,262 252,262 252,294 212,294', 'landmark roof-light');
  polygon(facilities, '400,578 440,578 440,606 400,606', 'landmark small-roof');

  northArrow(map, t, 466, 52);
  addText(map, t('map.zoneNorthBlock'), 100, 16, 'zone-label');
  addText(map, t('map.zoneSouthBlock'), 114, 292, 'zone-label');

  svgElement('rect', { x: 488, y: 286, width: 116, height: 200, rx: 6, class: 'tray' }, map);
  twoLines(t('map.unlocated')).forEach((line, index) => addText(map, line, 546, 306 + index * 14, 'tray-label', { 'text-anchor': 'middle' }));
}

export const SITE_MAPS = {
  shah: { viewBox: [55, 30, 900, 605], layout: shahLayout, draw: drawShah },
  bergfrieden: { viewBox: [244, 156, 562, 718], layout: bergfriedenLayout, draw: drawBergfrieden },
  tingatinga: { viewBox: [62, -8, 552, 630], layout: tingatingaLayout, draw: drawTingatinga }
};
