import { useEffect, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { RootStackParamList, TabParamList } from './src/types';
import { setupNotifications } from './src/notifications';
import { COLORS } from './src/utils/theme';
import TodayScreen from './src/screens/TodayScreen';
import TasksScreen from './src/screens/TasksScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AddTaskScreen from './src/screens/AddTaskScreen';
import EditTaskScreen from './src/screens/EditTaskScreen';
import TaskDetailScreen from './src/screens/TaskDetailScreen';
import ServiceProviderFormScreen from './src/screens/ServiceProviderFormScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.PRIMARY,
        tabBarInactiveTintColor: COLORS.TEXT_MUTED,
        tabBarStyle: {
          backgroundColor: COLORS.WHITE,
          borderTopColor: COLORS.BORDER,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Today: route.name === 'Today' ? 'today' : 'today-outline',
            Tasks: route.name === 'Tasks' ? 'list' : 'list-outline',
            Chat: route.name === 'Chat' ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline',
            Profile: route.name === 'Profile' ? 'person-circle' : 'person-circle-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: 'Today' }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ tabBarLabel: 'Tasks' }} />
      <Tab.Screen name="Chat" component={ChatScreen} options={{ tabBarLabel: 'Goldie' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

function navigateToTask(
  navRef: NavigationContainerRef<RootStackParamList> | null,
  taskId: string,
) {
  navRef?.navigate('TaskDetail', { taskId });
}

export default function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    setupNotifications();

    // Case 1: app was fully closed and launched by tapping a notification
    Notifications.getLastNotificationResponseAsync().then(response => {
      const taskId = response?.notification.request.content.data?.taskId as string | undefined;
      if (taskId) navigateToTask(navRef.current, taskId);
    });

    // Case 2: app is open (foreground or background) and user taps a notification
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const taskId = response.notification.request.content.data?.taskId as string | undefined;
      if (taskId) navigateToTask(navRef.current, taskId);
    });

    return () => sub.remove();
  }, []);

  return (
    <View style={styles.appContainer}>
      <NavigationContainer ref={navRef}>
        <StatusBar style="dark" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.BACKGROUND },
            headerTintColor: COLORS.PRIMARY,
            headerTitleStyle: { fontWeight: '700', fontSize: 20 },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen
            name="AddTask"
            component={AddTaskScreen}
            options={{ title: 'Add Task', presentation: 'modal' }}
          />
          <Stack.Screen
            name="EditTask"
            component={EditTaskScreen}
            options={{ title: 'Edit Task', presentation: 'modal' }}
          />
          <Stack.Screen
            name="TaskDetail"
            component={TaskDetailScreen}
            options={{ title: 'Task Details' }}
          />
          <Stack.Screen
            name="ServiceProviderForm"
            component={ServiceProviderFormScreen}
            options={({ route }) => ({
              title: route.params?.providerId ? 'Edit Provider' : 'New Provider',
              presentation: 'modal',
            })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: Platform.OS === 'web'
    ? ({
        flex: 1,
        maxWidth: 430,
        width: '100%',
        marginHorizontal: 'auto',
        backgroundColor: COLORS.BACKGROUND,
      } as any)
    : { flex: 1 },
});
