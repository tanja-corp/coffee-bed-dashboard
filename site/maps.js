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

/* ---------- Bergfrieden (45 beds, drawn from a hand sketch of the site, 900 x 1600 px scan) ---------- */
// The sketch was supplied mirrored left to right; the map keeps that mirrored layout with the numbers read the right way round.
// Bed 40 has no outline in the sketch (only its number), so its row is placed between beds 41 and 39.
// The short bed beside the power house is labelled ambiguously; it is read as 31, the only number missing from the right block.

function bergfriedenLayout() {
  const upper = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((index) => row(index + 1, 543.5, 388.5 + index * 25.5, 196, 18, 0));
  const leftTop = [671, 693, 715].map((cy, index) => row(11 + index, 261, cy, 236, 16, 0));
  const left = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    .map((index) => row(14 + index, 261, 737 + index * 30.8, 236, 20, 0));
  const right = [38, 37, 36, 35, 34, 33, 32, 30, 29, 28]
    .map((bed, index) => row(bed, 631, 866 + index * 29.1, 296, 20, 0));
  const central = [
    row(31, 735, 825, 96, 16, 0), row(39, 562, 825, 106, 16, 0), row(40, 632, 797, 296, 16, 0),
    row(41, 633, 770, 294, 16, 0), row(42, 562, 733, 144, 18, 0), row(43, 558, 700, 152, 18, 0),
    row(44, 558, 677, 152, 18, 0), column(45, 808, 1024, 240, 18, 0)
  ];
  return [...upper, ...leftTop, ...left, ...right, ...central].sort((a, b) => a.bed - b.bed);
}

function drawBergfrieden(map, t) {
  svgElement('rect', { x: 0, y: 240, width: 860, height: 1000, class: 'site-ground' }, map);
  polygon(map, '30,268 830,268 830,1210 74,1210', 'site-boundary');
  polygon(map, '30,268 830,268 830,1210 74,1210', 'site-boundary-line');
  svgElement('path', { d: 'M830 586 L830 634', class: 'gate-line' }, map);

  const ground = svgElement('g', { class: 'ground-features' }, map);
  svgElement('rect', { x: 140, y: 654, width: 242, height: 516, rx: 3, class: 'slab' }, ground);
  svgElement('rect', { x: 478, y: 852, width: 306, height: 296, rx: 3, class: 'slab' }, ground);
  svgElement('rect', { x: 437, y: 366, width: 213, height: 276, rx: 3, class: 'enclosure' }, ground);

  const facilities = svgElement('g', { class: 'facilities', 'aria-label': t('map.facilitiesAria') }, map);
  polygon(facilities, '100,300 312,300 312,350 100,350', 'landmark factory-roof');
  addText(facilities, t('facility.factory'), 206, 325, 'landmark-label');
  polygon(facilities, '425,303 668,303 668,346 425,346', 'landmark roof-warm');
  addText(facilities, t('facility.chemicalStore'), 546, 325, 'landmark-label');
  polygon(facilities, '133,388 385,388 385,646 133,646', 'landmark store-roof');
  addText(facilities, t('facility.coffeeStore'), 259, 517, 'landmark-label');
  polygon(facilities, '712,315 802,315 802,358 712,358', 'landmark roof-light');
  polygon(facilities, '708,428 792,428 792,468 708,468', 'landmark roof-light');
  polygon(facilities, '704,530 772,530 772,565 704,565', 'landmark roof-light');
  addText(facilities, t('map.houses'), 752, 498, 'minor-label');
  addText(facilities, t('map.entranceGate'), 760, 610, 'minor-label');
  polygon(facilities, '640,666 700,666 700,704 640,704', 'landmark small-roof');
  polygon(facilities, '640,708 700,708 700,744 640,744', 'landmark small-roof');
  addText(facilities, t('facility.office'), 670, 685, 'minor-label');
  addText(facilities, t('facility.office'), 670, 726, 'minor-label');
  polygon(facilities, '752,666 822,666 822,712 752,712', 'landmark roof-light');
  addText(facilities, t('facility.toilet'), 787, 689, 'minor-label');
  polygon(facilities, '626,808 682,808 682,852 626,852', 'landmark small-roof');
  addText(facilities, t('facility.power'), 654, 830, 'minor-label');
  polygon(facilities, '398,850 476,850 476,906 398,906', 'landmark roof-light');
  twoLines(t('facility.purchaseTank')).forEach((line, index) => addText(facilities, line, 437, 870 + index * 16, 'minor-label'));

  addText(map, t('map.zoneUpperBeds'), 440, 361, 'zone-label');
  addText(map, t('map.zoneCentral'), 482, 662, 'zone-label');
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
  bergfrieden: { viewBox: [20, 290, 822, 932], layout: bergfriedenLayout, draw: drawBergfrieden },
  tingatinga: { viewBox: [62, -8, 552, 630], layout: tingatingaLayout, draw: drawTingatinga }
};
