export const BOOK_COLORS: Record<string, { bg: string; text: string; abbr: string }> = {
  tab:        { bg: '#0A9E4A', text: '#fff', abbr: 'TB' },
  tabtouch:   { bg: '#26497F', text: '#fff', abbr: 'Tt' },
  betfair:    { bg: '#E0A400', text: '#1a1200', abbr: 'Bf' },
  sportsbet:  { bg: '#C0392B', text: '#fff', abbr: 'Sb' },
  ladbrokes:  { bg: '#B21C1C', text: '#fff', abbr: 'Lb' },
  pointsbet:  { bg: '#1c3c78', text: '#fff', abbr: 'Pb' },
  betr_au:    { bg: '#ff6600', text: '#fff', abbr: 'Bt' },
  unibet:     { bg: '#1B7B3D', text: '#fff', abbr: 'Un' },
  neds:       { bg: '#E63946', text: '#fff', abbr: 'Nd' },
}

export function getBookColor(bookmaker: string): { bg: string; text: string; abbr: string } {
  const key = bookmaker.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '')
  return BOOK_COLORS[key] ?? { bg: '#333', text: '#fff', abbr: bookmaker.slice(0, 2).toUpperCase() }
}

export const SPORT_COLORS: Record<string, string> = {
  rugbyleague_nrl: '#D64545',
  aussierules_afl: '#3B82F6',
  basketball_nbl:  '#8B5CF6',
  baseball_mlb:    '#3949AB',
  basketball_nba:  '#E8801F',
  americanfootball_nfl: '#8B5A2B',
  icehockey_nhl:   '#14B8A6',
}

export const SPORT_ABBR: Record<string, string> = {
  rugbyleague_nrl: 'NRL',
  aussierules_afl: 'AFL',
  basketball_nbl:  'NBL',
  baseball_mlb:    'MLB',
  basketball_nba:  'NBA',
  americanfootball_nfl: 'NFL',
  icehockey_nhl:   'NHL',
}

export function getSportColor(sportKey: string): string {
  return SPORT_COLORS[sportKey] ?? '#8F9AAE'
}

export function getSportAbbr(sportKey: string): string {
  if (SPORT_ABBR[sportKey]) return SPORT_ABBR[sportKey]
  // Try to extract short name from sport title
  return sportKey.split('_').pop()?.toUpperCase().slice(0, 3) ?? 'SPT'
}
