import { useColorScheme } from 'react-native';
import { ios } from './colors';

export function useAppTheme() {
  const scheme = useColorScheme() ?? 'dark';
  const isDark = scheme === 'dark';
  return { isDark, colors: isDark ? ios.dark : ios.light };
}