export const TZ = 'Africa/Nairobi';
export const DRYING_DAYS = 14;
export const AGE_GREEN_MAX = 7;
export const AGE_ORANGE_MAX = 10;
export const MOISTURE_TARGET = 11;
export const OCCUPANCY_ALERT = 80;
export const CURRENT_STATUS_DATE_ORDER = 'dmy';

// Native "Traceability Record Sheet_2026crop" workbook. Each site reads its own tab.
const SHEET_ID = '1GVz0MOv4t4FZjWLYBs6KeeVf9583wV3UqA6rWA_BlDs';
const csvUrl = (gid) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
const sheetUrl = (gid) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${gid}#gid=${gid}`;

// statusUrl: set to null to stop reading that tab live.
// snapshotCsvUrl: published read-only CSV used when the live tab cannot be read (Shah only).
// nylex: bed cover condition counts as provided; null when not recorded.
export const SITES = [
  {
    id: 'shah', tab: 'Shah', bedCount: 80,
    statusUrl: csvUrl('1305145'), sheetUrl: sheetUrl('1305145'),
    snapshotCsvUrl: './data/shah-drying-records.csv', sourceInfoUrl: './data/source-info.json',
    nylex: { good: 15, worn: 65 }, mobileZoom: 2
  },
  {
    id: 'bergfrieden', tab: 'BF', bedCount: 45,
    statusUrl: csvUrl('1183072210'), sheetUrl: sheetUrl('1183072210'),
    snapshotCsvUrl: null, sourceInfoUrl: null,
    nylex: null, mobileZoom: 1.6
  },
  {
    id: 'tingatinga', tab: 'TTC', bedCount: 25,
    statusUrl: csvUrl('544732964'), sheetUrl: sheetUrl('544732964'),
    snapshotCsvUrl: null, sourceInfoUrl: null,
    nylex: null, mobileZoom: 1.2
  }
];
export const DEFAULT_SITE = 'shah';
