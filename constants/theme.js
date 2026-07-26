/**
 * Charte visuelle Clutch — identité cartes flottantes / menthe pastel.
 */
export const colors = {
  mint: '#A8E6CF',
  mintSoft: '#D8F5E9',
  mintDeep: '#1B5E3B',
  page: '#F8F9FA',
  card: '#FFFFFF',
  ink: '#10261C',
  muted: '#4A6357',
  mutedSoft: '#7A9185',
  border: '#E2EAE5',
  chipBg: '#F1F5F9',
  badge: '#E8ECEA',
  badgeMint: '#E8F5EE',
  danger: '#E35D5D',
  star: '#E6B800',
  white: '#FFFFFF',
  black: '#000000',
};

export const radii = {
  card: 24,
  chip: 12,
  pill: 999,
  button: 16,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
};

export const theme = { colors, radii, shadows };
export default theme;
