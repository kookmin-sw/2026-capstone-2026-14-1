# 모바일 네이티브 앱 포팅 스펙

## 1. 문서 정보

- 문서명: 모바일 네이티브 앱 포팅 스펙
- 대상 프로젝트: FitPlus 웹캠 기반 운동 코칭 서비스
- 문서 목적: 모바일 웹에 최적화된 현재 코드베이스를 Capacitor를 이용하여 Android/iOS 네이티브 애플리케이션으로 패키징하는 절차와 명세를 정의한다.
- 문서 범위: 포팅 전략, Capacitor 환경 설정, 네이티브 기기 권한(카메라, 화면 유지) 부여 및 빌드/동기화 절차를 포함한다.

---

## 2. 배경 및 현재 구조

현재 시스템은 모바일 브라우저 구동을 위한 최적화가 완료된 상태다.

- `manifest.json`을 통한 PWA 스탠드얼론(Standalone) 모드 및 테마 설정 적용 완료
- `session-controller.js`에서 Wake Lock API를 활용한 화면 꺼짐 방지 적용 완료
- MediaPipe Pose 모델의 초기 구동 시 프레임 드랍(Freezing)을 막기 위한 백그라운드 웜업(Warm-up) 및 로딩 UI 적용 완료
- 뷰포트(Viewport) 및 모바일 비율에 맞춘 반응형 CSS 적용 완료

위 작업을 통해 웹 브라우저에서도 앱과 유사한 경험을 제공하지만, 공식 앱 마켓 출시와 더욱 안정적인 디바이스 제어를 위해서는 네이티브 앱 패키징이 요구된다.

---

## 3. 문제 정의

웹 환경만 유지할 경우 아래 문제가 남는다.

1. 사용자가 앱 스토어에서 검색하여 설치할 수 없어 접근성이 떨어진다.
2. OS 브라우저 정책(특히 iOS Safari)에 따라 카메라 권한 유지나 화면 꺼짐 방지 제어에 예기치 않은 제약이 생길 수 있다.
3. 기존 웹 프론트엔드 코드(Node.js SSR + Vanilla JS)를 React Native나 Flutter로 전면 재작성하는 것은 막대한 비용과 시간 지연을 초래한다.

---

## 4. 목표

### 4.1 핵심 목표

- 기존 웹 코드베이스와 로직을 100% 유지하면서 네이티브 앱(Android, iOS)으로 포팅한다.
- Capacitor를 도입하여 WebView 기반의 크로스 플랫폼 네이티브 래퍼(Wrapper)를 구축한다.
- 모바일 기기의 핵심 하드웨어(카메라) 권한을 네이티브 단에서 안정적으로 확보한다.

### 4.2 이번 단계의 범위

- Capacitor 프로젝트 초기화 및 코어 패키지 설치
- 타겟 플랫폼(Android, iOS) 구조 생성
- 운영체제별 권한 파일(`AndroidManifest.xml`, `Info.plist`) 세팅
- 웹 에셋과 네이티브 프로젝트 간의 동기화 및 로컬 빌드 환경 구축

---

## 5. 비목표

이번 단계에서 포함하지 않는 항목은 아래와 같다.

- 웹 프론트엔드 프레임워크(React, Vue 등)로의 아키텍처 마이그레이션
- 오프라인 전용 데이터 동기화 로직 및 로컬 SQLite 도입 (현재는 온라인 상태를 가정)
- App Store 및 Google Play Store 최종 심사 및 프로덕션 배포 절차
- 푸시 알림(Push Notification) 연동

---

## 6. 설계 원칙

1. **Single Source of Truth 유지:** 기존 웹 소스(`public/`, `views/`)를 앱과 웹의 공통 기반으로 유지한다.
2. **표준 Web API 우선 사용:** 모바일 분기 처리를 최소화하고, 카메라 접근(`MediaDevices`)과 화면 제어(`WakeLock`)는 브라우저 표준 API를 그대로 활용한다.
3. **최소한의 플러그인:** Capacitor 코어 모듈을 제외한 불필요한 서드파티 네이티브 플러그인 도입을 지양하여 유지보수 비용을 낮춘다.

---

## 7. 실행 계획: Capacitor 설정

### 7.1 패키지 설치 및 초기화

프로젝트 루트 디렉토리에서 아래 명령을 통해 포팅 환경을 구성한다. 앱 식별자는 `com.fitplus.app`을 사용한다.

```bash
# Capacitor 코어 및 CLI 설치
npm install @capacitor/core @capacitor/cli

# 프로젝트 초기화 (웹 에셋 디렉토리 지정)
npx cap init FitPlus com.fitplus.app --web-dir public
```

### 7.2 타겟 플랫폼 추가

생성할 모바일 OS 플랫폼을 추가한다. (iOS 빌드는 macOS 환경에서만 유효하다.)

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```

---

## 8. 실행 계획: 네이티브 권한 설정

앱이 모바일 기기에서 정상적으로 하드웨어를 제어할 수 있도록 각 OS별 권한 명세 파일에 접근 권한을 선언한다.

### 8.1 Android 권한 스펙

- 파일 경로: `android/app/src/main/AndroidManifest.xml`
- 요구 권한: 카메라 접근 권한 및 하드웨어 명시, Wake Lock 권한

`<manifest>` 태그 내부에 다음 내용을 삽입한다.

```xml
<!-- 카메라 접근 권한 -->
<uses-permission android:name="android.permission.CAMERA" />
<!-- 기기에 카메라 하드웨어가 있음을 명시 -->
<uses-feature android:name="android.hardware.camera" />
<!-- 화면 꺼짐 방지 권한 -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### 8.2 iOS 권한 스펙

- 파일 경로: `ios/App/App/Info.plist`
- 요구 권한: 카메라 사용 목적 명시

`<dict>` 태그 내부에 다음 내용을 삽입한다.

```xml
<key>NSCameraUsageDescription</key>
<string>운동 자세를 실시간으로 분석하기 위해 카메라 접근 권한이 필요합니다.</string>
```

---

## 9. 동기화 및 빌드 절차

웹 코드(JS, HTML, CSS 등)가 수정되거나 추가될 때마다 모바일 네이티브 프로젝트로 에셋을 덮어씌워야 한다.

### 9.1 동기화 커맨드

```bash
npx cap sync
```

해당 명령어는 설정된 `webDir`(`public`)의 에셋과 Capacitor 플러그인 변경사항을 Android/iOS 프로젝트로 복사한다.

### 9.2 디바이스 실행

동기화 완료 후, 각 플랫폼별 네이티브 IDE를 열어 빌드 및 디바이스 테스트를 진행한다.

```bash
# Android Studio 실행
npx cap open android

# Xcode 실행
npx cap open ios
```

---

## 10. 결론

이 스펙의 핵심은 **기존에 잘 구축된 Web 기반 AI 판정 엔진을 한 줄의 코드 수정 없이 네이티브 앱 환경으로 이전하는 것**이다. 
Capacitor를 이용한 래핑(Wrapping) 전략을 통해, 웹 서비스의 민첩성을 유지하면서 모바일 앱스토어 진입이라는 비즈니스 요구사항을 가장 빠르고 안정적으로 달성할 수 있다.