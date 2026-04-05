import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ 
      headerShown: false,
      tabBarStyle: { display: 'none', height: 0, opacity: 0 }, // Force kill the native bar
    }}>
      {/* Ensure index is the only route, and hide it from native tabs */}
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}