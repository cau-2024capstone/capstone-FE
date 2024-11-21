import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import { Image } from "expo-image";
import * as Location from "expo-location";

const CurrentLocationScreen = ({
  selectedRoute,
  localIP,
  userIdf,
  navigation,
}) => {
  const [userLocation, setUserLocation] = useState(null);
  const [isLocationLoading, setIsLocationLoading] = useState(true);

  // 상태 관리 변수들
  const [routePoints, setRoutePoints] = useState([]);
  const [passedRoutePoints, setPassedRoutePoints] = useState([]);
  const [arrivalButtonEnabled, setArrivalButtonEnabled] = useState(false);
  const [lastDestinationPoint, setLastDestinationPoint] = useState(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showEndNavigationConfirm, setShowEndNavigationConfirm] =
    useState(false);

  const [problemRoutes, setProblemRoutes] = useState([]);

  const [issueReportingStage, setIssueReportingStage] = useState(null);
  const [problemStartPoint, setProblemStartPoint] = useState(null);
  const [problemEndPoint, setProblemEndPoint] = useState(null);

  const [temporaryPin, setTemporaryPin] = useState(null);

  const mapRef = useRef(null);

  const locationInterval = useRef(null); // 위치 업데이트를 위한 Interval 참조

  useEffect(() => {
    // 경로 데이터 처리
    const processRoads = (roads, startId) => {
      let currentPointId = startId;
      const processedRoads = [];

      roads.forEach((road) => {
        const [fromId, toId] = road.idf.split("_");
        if (fromId === currentPointId) {
          // 도로가 올바른 방향
          processedRoads.push(road);
          currentPointId = toId;
        } else if (toId === currentPointId) {
          // 도로가 반대 방향이므로 반전
          const reversedRoad = {
            ...road,
            idf: `${toId}_${fromId}`,
            startLat: road.endLat,
            startLng: road.endLng,
            endLat: road.startLat,
            endLng: road.startLng,
          };
          processedRoads.push(reversedRoad);
          currentPointId = fromId;
        } else {
          console.log(
            "도로가 현재 포인트와 연결되지 않습니다.",
            road,
            currentPointId
          );
        }
      });
      return processedRoads;
    };

    const { start, roads } = selectedRoute;
    const processedRoads = processRoads(roads, start);
    const points = generateRoutePoints(processedRoads);
    console.log("points:", points);
    setRoutePoints(points);

    if (points.length > 0) {
      setLastDestinationPoint(points[points.length - 1]);
      addAndRemoveTemporaryPin();
      updateUserLocation();
    }

    // 컴포넌트 언마운트 시 위치 업데이트 중지
    return () => {
      if (locationInterval.current) {
        clearInterval(locationInterval.current);
      }
    };
  }, []);

  const addAndRemoveTemporaryPin = () => {
    const tempCoordinate = {
      latitude: 30,
      longitude: 120,
    };
    setTemporaryPin(tempCoordinate);

    setTimeout(() => {
      setTemporaryPin(null);
    }, 50);
  };

  const generateRoutePoints = (roads) => {
    let routePoints = [];
    for (let i = 0; i < roads.length; i++) {
      const road = roads[i];
      const start = { latitude: road.startLat, longitude: road.startLng };
      const end = { latitude: road.endLat, longitude: road.endLng };
      const segmentPoints = interpolatePoints(start, end);
      routePoints = routePoints.concat(segmentPoints);
    }
    return routePoints;
  };

  const interpolatePoints = (start, end, numPoints = 10) => {
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const latitude =
        start.latitude + ((end.latitude - start.latitude) * i) / numPoints;
      const longitude =
        start.longitude + ((end.longitude - start.longitude) * i) / numPoints;
      points.push({ latitude, longitude });
    }
    return points;
  };

  // 사용자 위치 업데이트 함수 수정
  const updateUserLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("권한 거부", "위치 권한이 거부되었습니다.");
        return;
      }

      // 현재 위치 가져오기
      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      const currentLocation = { latitude, longitude };
      setUserLocation(currentLocation);
      console.log(`현재 위치 (초기): ${latitude}, ${longitude}`);
      setIsLocationLoading(false);

      // 위치 업데이트를 주기적으로 가져오기
      locationInterval.current = setInterval(async () => {
        let location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;
        const newLocation = { latitude, longitude };
        setUserLocation(newLocation);
        updatePassedRoutePoints(newLocation);
        console.log(`현재 위치 (업데이트): ${latitude}, ${longitude}`);
      }, 3000); // 5초마다 위치 업데이트
    } catch (error) {
      console.log("위치 업데이트 오류:", error);
      setIsLocationLoading(false);
    }
  };

  // 사용자의 위치에 따라 지나간 경로를 업데이트하는 함수
  const updatePassedRoutePoints = (location) => {
    if (routePoints.length === 0) return;

    const threshold = 0.0002;

    const nearestPointIndex = findNearestRoutePointIndex(location, routePoints);

    if (nearestPointIndex !== -1) {
      const distance = calculateDistance(
        location,
        routePoints[nearestPointIndex]
      );
      if (distance <= threshold) {
        const passedPoints = routePoints.slice(0, nearestPointIndex + 1);
        setPassedRoutePoints((prevPoints) => [...prevPoints, ...passedPoints]);

        const remainingRoutePoints = routePoints.slice(nearestPointIndex + 1);
        setRoutePoints(remainingRoutePoints);
      }
    }

    if (routePoints.length === 0 || isNearDestination(location)) {
      setArrivalButtonEnabled(true);
    }
  };

  const findNearestRoutePointIndex = (location, points) => {
    let minDistance = Infinity;
    let nearestIndex = -1;
    points.forEach((point, index) => {
      const distance = calculateDistance(location, point);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  };

  const calculateDistance = (loc1, loc2) => {
    if (!loc1 || !loc2) {
      console.log(
        "calculateDistance: loc1 또는 loc2가 null 또는 undefined입니다."
      );
      return Infinity;
    }
    const deltaLat = loc1.latitude - loc2.latitude;
    const deltaLon = loc1.longitude - loc2.longitude;
    return Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon);
  };

  const isNearDestination = (location) => {
    const destination = lastDestinationPoint;
    if (!destination) return false;
    const distance = calculateDistance(location, destination);
    const arrivalThreshold = 0.0005;
    return distance <= arrivalThreshold;
  };

  const handleArriveButtonPress = () => {
    setShowCompletionModal(true);

    setShowCompletionModal(false);
    navigation.navigate("ResultScreen", {
      passedRoutePoints,
      deviatedEdges: [], // 보라색 경로를 삭제하였으므로 빈 배열로 전달
      problemRoutes,
    });
  };

  const handleReportProblemRoute = () => {
    setIssueReportingStage("start");
  };

  const handleConfirmProblemRoute = async () => {
    if (!problemStartPoint || !problemEndPoint) {
      Alert.alert("오류", "문제 지점 두 포인트를 설정해주세요.");
      return;
    }

    // 로딩 표시
    setShowCompletionModal(true);

    // 두 포인트의 가장 가까운 세분화된 점 찾기
    try {
      console.log(
        `문제 시작 지점에 대한 closest-point API 호출: lat=${problemStartPoint.latitude}, lng=${problemStartPoint.longitude}`
      );
      const startPointResponse = await fetch(
        `https://accurately-healthy-duckling.ngrok-free.app/api/points/closest-point?lat=${problemStartPoint.latitude}&lng=${problemStartPoint.longitude}&radius=20`
      );
      const endPointResponse = await fetch(
        `https://accurately-healthy-duckling.ngrok-free.app/api/points/closest-point?lat=${problemEndPoint.latitude}&lng=${problemEndPoint.longitude}&radius=20`
      );

      const startPointData = await startPointResponse.text(); // 응답을 텍스트로 받음
      const endPointData = await endPointResponse.text();

      if (
        !startPointData ||
        startPointData === "null" ||
        !endPointData ||
        endPointData === "null"
      ) {
        Alert.alert("문의 실패", "잘못된 문의 위치입니다.");
      } else {
        // 가장 가까운 점의 ID 추출
        const startId = startPointData.replace(/"/g, "");
        const endId = endPointData.replace(/"/g, "");

        console.log(
          `문의한 시작 핀 ID: ${startId}, 문의한 도착 핀 ID: ${endId}`
        );

        // 문의 정보를 서버로 전송하는 API 호출 추가
        const userEmail = "mj10050203@gmail.com"; // 사용자 ID
        const inquiryBody = {
          startNodeIdf: startId,
          endNodeIdf: endId,
          actionType: "REMOVE",
        };

        try {
          console.log(
            `https://accurately-healthy-duckling.ngrok-free.app/api/users/submit-inquiry/${userEmail}`
          );
          const inquiryResponse = await fetch(
            `https://accurately-healthy-duckling.ngrok-free.app/api/users/submit-inquiry/${userEmail}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(inquiryBody),
            }
          );

          if (!inquiryResponse.ok) {
            // 오류 처리
            const errorText = await inquiryResponse.text();
            console.error("문의 제출 오류:", errorText);
            Alert.alert("문의 실패", "문의 제출 중 오류가 발생했습니다.");
          } else {
            Alert.alert("문의 완료", "문의가 성공적으로 접수되었습니다.");

            // 문의 핀 제거 및 검은색 선 추가
            setProblemStartPoint(null);
            setProblemEndPoint(null);

            setProblemRoutes((prevRoutes) => [
              ...prevRoutes,
              {
                coordinates: [problemStartPoint, problemEndPoint],
                color: "black",
              },
            ]);

            addAndRemoveTemporaryPin();
          }
        } catch (error) {
          console.error("문의 제출 중 오류 발생:", error);
          Alert.alert("문의 실패", "API 호출 실패");
        }
      }
    } catch (error) {
      console.log("가장 가까운 포인트를 가져오는 중 오류 발생:", error);
      Alert.alert("문의 실패", "API 호출 실패");
    } finally {
      setShowCompletionModal(false);
      setIssueReportingStage(null);
      // 산책 종료 여부 확인
      Alert.alert(
        "산책 종료",
        "산책을 종료하시겠습니까?",
        [
          {
            text: "아니오",
            onPress: () => {},
            style: "cancel",
          },
          {
            text: "네",
            onPress: () => {
              navigation.navigate("StartPointSelection");
            },
          },
        ],
        { cancelable: false }
      );
    }
  };

  const onMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (issueReportingStage === "start") {
      const newPoint = { latitude, longitude };
      const nearestPoint = findNearestPoint(
        newPoint,
        routePoints.concat(passedRoutePoints)
      );
      setProblemStartPoint(nearestPoint);
      addAndRemoveTemporaryPin();
    } else if (issueReportingStage === "end") {
      const newPoint = { latitude, longitude };
      const nearestPoint = findNearestPoint(
        newPoint,
        routePoints.concat(passedRoutePoints)
      );
      setProblemEndPoint(nearestPoint);
      addAndRemoveTemporaryPin();
    }
  };

  const findNearestPoint = (location, points) => {
    if (!location || points.length === 0) {
      return null;
    }
    let minDistance = Infinity;
    let nearestPoint = null;
    points.forEach((point) => {
      const distance = calculateDistance(location, point);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    });
    return nearestPoint;
  };

  const handleEndNavigation = () => {
    setShowEndNavigationConfirm(true);
  };

  const confirmEndNavigation = () => {
    setShowEndNavigationConfirm(false);
    setShowCompletionModal(true);

    setShowCompletionModal(false);
    navigation.navigate("ResultScreen", {
      passedRoutePoints,
      deviatedEdges: [], // 보라색 경로를 삭제하였으므로 빈 배열로 전달
      problemRoutes,
    });
  };

  const cancelEndNavigation = () => {
    setShowEndNavigationConfirm(false);
  };

  if (isLocationLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="rgba(74, 143, 62, 1)" />
        <Text style={{ marginTop: 10 }}>위치 정보를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {issueReportingStage && (
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>
            {issueReportingStage === "start"
              ? "문제 시작 위치를 선택하세요"
              : "문제 종료 위치를 선택하세요"}
          </Text>
        </View>
      )}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: userLocation?.latitude || 37.504558,
          longitude: userLocation?.longitude || 126.956951,
          latitudeDelta: 0.002,
          longitudeDelta: 0.002,
        }}
        onPress={onMapPress}
        scrollEnabled={true} // 문의할 때 지도 움직일 수 있게 수정
      >
        {passedRoutePoints.length > 0 && (
          <Polyline
            coordinates={passedRoutePoints}
            strokeColor="#808080"
            strokeWidth={3}
          />
        )}
        {routePoints.length > 0 && (
          <Polyline
            coordinates={routePoints}
            strokeColor="#FF0000"
            strokeWidth={3}
          />
        )}
        {problemRoutes.map((route, index) => (
          <Polyline
            key={`problemRoute-${index}`}
            coordinates={route.coordinates}
            strokeColor={route.color}
            strokeWidth={3}
            zIndex={2}
          />
        ))}
        {userLocation && (
          <Marker coordinate={userLocation}>
            <View style={styles.userMarker}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}
        {temporaryPin && (
          <Marker coordinate={temporaryPin} pinColor="transparent" />
        )}
        {problemStartPoint && (
          <Marker
            coordinate={problemStartPoint}
            pinColor="green"
            title="문제 시작 위치"
          />
        )}
        {problemEndPoint && (
          <Marker
            coordinate={problemEndPoint}
            pinColor="red"
            title="문제 종료 위치"
          />
        )}
      </MapView>
      <View style={styles.buttonContainer}>
        {!issueReportingStage && (
          <>
            <TouchableOpacity
              style={styles.button}
              onPress={handleReportProblemRoute}
            >
              <Text style={styles.buttonText}>경로 문제 보고하기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.endNavigationButton}
              onPress={handleEndNavigation}
            >
              <Text style={styles.endNavigationButtonText}>
                네비게이션 종료
              </Text>
            </TouchableOpacity>
          </>
        )}
        {issueReportingStage && (
          <TouchableOpacity
            style={styles.completeButton}
            onPress={() => {
              if (issueReportingStage === "start") {
                if (!problemStartPoint) {
                  Alert.alert("오류", "문제 시작 위치를 선택해주세요.");
                } else {
                  setIssueReportingStage("end");
                }
              } else if (issueReportingStage === "end") {
                if (!problemEndPoint) {
                  Alert.alert("오류", "문제 종료 위치를 선택해주세요.");
                } else {
                  handleConfirmProblemRoute();
                }
              }
            }}
          >
            <Text style={styles.completeButtonText}>설정 완료</Text>
          </TouchableOpacity>
        )}
        {arrivalButtonEnabled && (
          <TouchableOpacity
            style={styles.arriveButton}
            onPress={handleArriveButtonPress}
          >
            <Text style={styles.arriveButtonText}>도착</Text>
          </TouchableOpacity>
        )}
      </View>

      {showCompletionModal && (
        <Modal
          transparent={true}
          animationType="fade"
          visible={showCompletionModal}
        >
          <View style={styles.modalBackground}>
            <View style={styles.activityIndicatorWrapper}>
              <Image
                source={require("../../assets/images/walkingAnimation.gif")}
                style={{ width: 100, height: 100 }}
              />
              <Text style={{ marginTop: 10 }}>처리 중...</Text>
            </View>
          </View>
        </Modal>
      )}

      {showEndNavigationConfirm &&
        Alert.alert(
          "종료 확인",
          "산책을 종료하시겠습니까?",
          [
            { text: "아니오", onPress: cancelEndNavigation },
            { text: "네", onPress: confirmEndNavigation },
          ],
          { cancelable: false }
        )}
    </View>
  );
};

export default CurrentLocationScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  titleContainer: {
    position: "absolute",
    top: 50,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(74, 143, 62, 1)",
  },
  titleText: {
    fontSize: 16,
    color: "rgba(74, 143, 62, 1)",
    fontWeight: "bold",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    alignItems: "center",
  },
  button: {
    backgroundColor: "#FEFEFEaa",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(74, 143, 62, 1)",
    justifyContent: "center",
    alignItems: "center",
    width: 200,
  },
  buttonText: {
    fontSize: 14,
    color: "rgba(74, 143, 62, 1)",
  },
  arriveButton: {
    backgroundColor: "rgba(74, 143, 62, 1)",
    padding: 15,
    borderRadius: 8,
    width: 200,
    alignItems: "center",
    alignSelf: "center",
    marginTop: 10,
  },
  arriveButtonText: {
    fontSize: 16,
    color: "#FEFEFE",
  },
  completeButton: {
    backgroundColor: "rgba(74, 143, 62, 1)",
    padding: 15,
    borderRadius: 8,
    width: 200,
    alignItems: "center",
    alignSelf: "center",
    marginTop: 10,
  },
  completeButtonText: {
    fontSize: 16,
    color: "#FEFEFE",
  },
  endNavigationButton: {
    backgroundColor: "rgba(255, 0, 0, 0.7)",
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
    width: 200,
    alignItems: "center",
    alignSelf: "center",
  },
  endNavigationButtonText: {
    fontSize: 14,
    color: "#FEFEFE",
  },
  modalBackground: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00000040",
  },
  activityIndicatorWrapper: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  userMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(74, 143, 62, 1)",
    justifyContent: "center",
    alignItems: "center",
  },
  userMarkerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FEFEFE",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
