# FitPlus 모바일 포팅 명세서 (Mobile Porting Plan)

본 문서는 현재 웹(PWA) 기반으로 모바일 최적화가 완료된 FitPlus 프로젝트를 네이티브 모바일 애플리케이션(Android / iOS)으로 패키징하기 위한 단계별 계획과 기술 명세를 담고 있습니다.

## 1. 개요 (Overview)
*   **목적**: 기존 웹 기술(Node.js, Express, EJS, Vanilla JS)로 작성된 FitPlus를 모바일 앱 마켓(Google Play Store, Apple App Store)에 출시 가능한 네이티브 앱으로 변환.
*   **핵심 기술**: **Capacitor** (웹앱을 네이티브 앱으로 감싸주는 크로스 플랫폼 프레임워크). 별도의 프론트엔드 프레임워크(React, Vue 등) 전환 없이 현재 코드를 그대로 유지하며 포팅 진행.
*   **타겟 플랫폼**: Android (안드로이드 7.0 이상 권장), iOS (iOS 13.0 이상 권장)

## 2. 현재 달성된 모바일 최적화 상태 (사전 작업 완료)
1.  **PWA 기반 설정 (`manifest.json`)**: 앱 아이콘, 테마 색상, 전체화면(Standalone) 모드 적용 완료.
2.  **화면 꺼짐 방지 (`Wake Lock API`)**: 운동 세션 중 스마트폰 화면이 절전 모드로 진입하는 현상 방지 완료.
3.  **AI 모델 로딩 최적화 (Warm-up)**: 모바일 환경에서 무거운 MediaPipe Pose 모델 로딩 시 화면 멈춤(Freezing) 방지 및 시각적 애니메이션 적용 완료.
4.  **반응형 UI (Responsive Design)**: 카메라 영역 및 설정 패널 모바일 화면 맞춤화 및 CSS 오작동 버그 수정 완료.

---

## 3. 포팅 실행 계획 (Step-by-Step Porting Guide)

### Phase 1: Capacitor 패키지 설치 및 초기화
웹 프로젝트를 모바일 프로젝트로 변환하기 위한 필수 패키지를 설치합니다.

```bash
# 1. 루트 디렉토리에서 패키지 설치
npm install @capacitor/core @capacitor/cli

# 2. Capacitor 초기화 (앱 이름 및 패키지 식별자 지정)
npx cap init FitPlus com.fitplus.app --web-dir public
```

### Phase 2: 타겟 플랫폼(Android / iOS) 추가
안드로이드 및 iOS 네이티브 껍데기를 생성합니다. (Mac 환경에서만 iOS 빌드 가능)

```bash
# 플랫폼 패키지 설치
npm install @capacitor/android @capacitor/ios

# 안드로이드 및 iOS 프로젝트 생성
npx cap add android
npx cap add ios
```

### Phase 3: 네이티브 권한(Permissions) 설정
FitPlus의 핵심 기능인 '카메라'를 앱 내에서 사용하기 위해 네이티브 설정 파일에 권한을 명시해야 합니다.

#### 1. Android (`android/app/src/main/AndroidManifest.xml`)
`<manifest>` 태그 내부에 다음 권한을 추가합니다.
```xml
<!-- 카메라 권한 -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" />
<!-- 화면 꺼짐 방지 추가 권한 (Wake Lock API 지원용) -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

#### 2. iOS (`ios/App/App/Info.plist`)
`<dict>` 태그 내부에 다음 항목을 추가합니다.
```xml
<key>NSCameraUsageDescription</key>
<string>운동 자세를 실시간으로 분석하기 위해 카메라 접근 권한이 필요합니다.</string>
```

### Phase 4: 빌드 및 디바이스 테스트
웹 코드가 수정될 때마다 모바일 프로젝트에 동기화하고, IDE를 열어 실제 기기에서 테스트합니다.

```bash
# 웹 에셋(public 폴더 등)을 모바일 폴더로 복사 및 동기화
npx cap sync

# Android Studio 열기 (이후 Run 버튼으로 실행)
npx cap open android

# Xcode 열기 (이후 Run 버튼으로 실행)
npx cap open ios
```

---

## 4. 추가 고도화 고려 사항 (Future Considerations)

*   **스플래시 스크린 및 아이콘 생성 (`@capacitor/splash-screen`)**
    *   현재 `public/images/`에 임시로 존재하는 아이콘을 공식 로고로 교체한 뒤, `@capacitor/assets` 패키지를 사용하여 기기 해상도별 아이콘과 시작 화면(Splash Screen) 이미지를 자동 생성합니다.
*   **오프라인 모드 데이터 동기화 강화**
    *   네트워크 단절 상태에서 운동을 완료할 경우, Capacitor의 `Preferences` 플러그인(로컬 스토리지 상위 호환)을 이용하여 데이터를 안전하게 보관하고 백그라운드에서 동기화하는 로직 추가가 필요할 수 있습니다.
*   **백엔드 API URL 변경**
    *   현재 로컬에서 구동 중이라면 모바일 기기에서 `localhost:3000`으로 접근할 수 없습니다. 백엔드 서버를 클라우드(예: AWS, Render, Heroku)에 배포한 후, 프론트엔드 JS 코드의 API 호출 URL을 배포된 주소로 변경하여 빌드해야 합니다.