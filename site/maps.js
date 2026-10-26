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

/* ---------- Shah (field numbering transcribed from the annotated site print) ---------- */

function shahLayout() {
  const layout = [];
  // Upper central-west: 70 at the far left, then 24 through 1 from left to right.
  // Lower central-west: 42 through 25; 25 sits directly below upper bed 8.
  const westX = (col) => 130 + col * 17.5;
  for (let col = 0; col < 25; col += 1) {
    const bed = col === 0 ? 70 : 25 - col;
    const position = { bed, x: westX(col), y: 455, width: 16, height: 200, rotation: 0 };
    if (bed === 7 || bed === 8) {
      position.segments = [
        { x: position.x, y: 455, width: 16, height: 94 },
        { x: position.x, y: 561, width: 16, height: 94 }
      ];
      position.labelY = 610;
    }
    layout.push(position);
  }
  for (let col = 0; col < 18; col += 1) {
    layout.push({ bed: 42 - col, x: westX(col), y: 685, width: 16, height: 200, rotation: 0 });
  }
  // Both north runs point upward: 43 and 54 are at the bottom, 53 and 64 at the top.
  for (let index = 0; index < 11; index += 1) {
    const y = 385 - index * 25;
    layout.push({ bed: 43 + index, x: 365, y, width: 190, height: 16, rotation: 0 });
    layout.push({ bed: 54 + index, x: 155, y, width: 190, height: 16, rotation: 0 });
  }
  layout.push(column(65, 124, 252, 250, 14, 0));
  layout.push(column(null, 143, 252, 250, 14, 0));
  layout.push(column(66, 645, 250, 240, 15, 0));
  layout.push(column(69, 670, 250, 240, 15, 0));
  layout.push(column(67, 695, 250, 240, 15, 0));
  layout.push(row(71, 460, 105, 190, 16, 0));
  layout.push(row(72, 881, 445, 72, 14, 0));
  // East: two horizontal lines of six long vertical beds, then a second 75 below.
  [73, 79].forEach((first, group) => {
    for (let col = 0; col < 6; col += 1) {
      layout.push({ bed: first + col, x: 842 + col * 24, y: 480 + group * 155, width: 18, height: 120, rotation: 0 });
    }
  });
  layout.push({ bed: 75, x: 875, y: 795, width: 72, height: 15, rotation: 0 });
  layout.push({ bed: 68, x: 960, y: 944, width: 72, height: 14, rotation: 0, unlocated: true });
  return layout;
}

function drawShah(map, t) {
  svgElement('rect', { x: 0, y: 0, width: 1120, height: 1050, class: 'site-ground' }, map);
  svgElement('path', { d: 'M116 48 L704 39 L985 118 L1040 890 L820 970 L205 970 L94 900 Z', class: 'site-boundary' }, map);
  svgElement('path', { d: 'M111 49 L704 40 L984 118 L1039 889 L820 969 L205 969 L95 899 Z', class: 'site-boundary-line' }, map);
  northArrow(map, t, 74, 74);
  svgElement('rect', { x: 946, y: 930, width: 100, height: 42, rx: 5, class: 'tray' }, map);
  addText(map, t('map.zoneNorth'), 155, 67, 'zone-label');
  addText(map, t('map.zoneNortheast'), 630, 100, 'zone-label');
  addText(map, t('map.zoneWestUpper'), 130, 440, 'zone-label');
  addText(map, t('map.zoneWestLower'), 130, 675, 'zone-label');
  addText(map, t('map.zoneEast'), 847, 430, 'zone-label');
  const facilities = svgElement('g', { class: 'facilities', 'aria-label': t('map.facilitiesAria') }, map);
  svgElement('circle', { cx: 444, cy: 555, r: 5, class: 'bed-pole' }, facilities);
  polygon(facilities, '785,90 843,108 835,162 777,146', 'landmark skin-roof');
  polygon(facilities, '785,90 814,99 806,154 777,146', 'skin-roof-blue');
  addText(facilities, t('facility.skinDryer'), 811, 185, 'landmark-label-outside');
  polygon(facilities, '615,430 709,439 700,498 606,488', 'landmark store-roof');
  addText(facilities, t('facility.store'), 657, 465, 'landmark-label');
  svgElement('circle', { cx: 650, cy: 620, r: 38, class: 'landmark landmark-dam' }, facilities);
  svgElement('circle', { cx: 650, cy: 620, r: 30, class: 'dam-waterline' }, facilities);
  addText(facilities, t('facility.dam'), 650, 620, 'landmark-label');
  polygon(facilities, '620,700 751,709 743,845 610,832', 'landmark factory-roof');
  svgElement('line', { x1: 630, y1: 737, x2: 743, y2: 745, class: 'roof-ridge' }, facilities);
  addText(facilities, t('facility.factory'), 681, 773, 'landmark-label');
  polygon(facilities, '772,430 823,433 817,823 765,816', 'long-roof');
  addText(facilities, t('map.washingArea'), 795, 530, 'long-roof-label', { transform: 'rotate(90 795 530)' });
  addText(facilities, t('map.fermentation'), 793, 710, 'long-roof-label', { transform: 'rotate(90 793 710)' });
  polygon(facilities, '525,665 580,667 578,710 523,707', 'landmark small-roof');
  polygon(facilities, '540,780 600,784 597,825 537,821', 'landmark small-roof');
  polygon(facilities, '500,785 535,787 532,825 497,822', 'landmark small-roof');
  addText(facilities, t('map.smallBuildings'), 548, 855, 'minor-label');
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
  shah: { viewBox: [55, 30, 1020, 1010], layout: shahLayout, draw: drawShah },
  bergfrieden: { viewBox: [20, 290, 822, 932], layout: bergfriedenLayout, draw: drawBergfrieden },
  tingatinga: { viewBox: [62, -8, 552, 630], layout: tingatingaLayout, draw: drawTingatinga }
};
