import { NavigationContainer } from '@react-navigation/native';
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import * as Location from "expo-location";
import { useFonts } from 'expo-font';
import TMapView from "./components/TMapView.js";
import BottomTabApp from "./components/TabBar.js";

const App = () => {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // 폰트 로드 설정
  const [fontsLoaded] = useFonts({
    'NotoSansKR-Regular': require('./assets/fonts/NotoSansKR-Regular.ttf'),
    'NotoSansKR-Medium': require('./assets/fonts/NotoSansKR-Medium.ttf'),
    'NotoSansKR-Bold': require('./assets/fonts/NotoSansKR-Bold.ttf'),
  });

  useEffect(() => {
    (async () => {
      // 위치 권한 요청
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("위치 권한이 거부되었습니다.");
        return;
      }

      // 현재 위치 가져오기
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    })();
  }, []);

  const renderContent = () => {
    if (location) {
      const { latitude, longitude } = location.coords;
      return (
        <View style={styles.container}>
          <TMapView latitude={latitude} longitude={longitude} />
        </View>
      );
    } else if (errorMsg) {
      return (
        <View style={styles.container}>
          <Text style={{ fontFamily: 'NotoSansKR-Regular' }}>{errorMsg}</Text>
        </View>
      );
    } else {
      return (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={[styles.loadingText, { fontFamily: 'NotoSansKR-Regular' }]}>지도 불러오는 중...</Text>
        </View>
      );
    }
  };

  // 폰트가 로드되지 않은 경우 로딩 스크린을 표시
  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={[styles.loadingText, { fontFamily: 'NotoSansKR-Regular' }]}>폰트 로드 중...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {renderContent()}
      <BottomTabApp />
    </NavigationContainer>
  );
};

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    marginBottom: 100,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 20,
  },
});
