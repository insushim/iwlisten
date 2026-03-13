# Global Learnings

## Cloudflare Pages + D1

- Pages 워크플로는 하나만 유지하고, 프로젝트명도 `iwlisten`으로 통일한다.
- `wrangler.toml`의 D1 `database_id` 플레이스홀더가 남아 있으면 Functions 배포가 마지막 단계에서 실패한다.
- Pages 프로젝트를 먼저 만들고 `JWT_SECRET` 같은 Pages secret을 올린 뒤 배포를 검증한다.
- D1 계정 한도가 꽉 차 있으면 새 서비스 배포가 막히므로, 새 앱 시작 전에 사용 중인 D1 개수를 먼저 확인한다.

## GitHub Actions

- Cloudflare 배포 워크플로에는 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID` 둘 다 필요하다.
- 예전 배포 워크플로가 남아 있으면 새 배포와 무관한 실패가 같이 발생하므로, 플랫폼 전환 시 오래된 workflow를 바로 제거한다.
- 웹 버전, 서비스워커 캐시 버전, APK 버전, GitHub Release 태그는 한 스크립트에서 같이 스탬프하는 편이 안전하다.

## Android WebView APK

- `webview-apk`를 공식 APK 빌드 대상으로 쓰고, 예전 `android/` Capacitor 경로와 혼용하지 않는다.
- Gradle Kotlin DSL에서는 `dependencyResolutionManagement` 오타 하나로 CI 빌드가 바로 깨진다.
- 앱 버전 비교는 `BuildConfig`에 기대기보다 런타임 `packageManager`의 `versionName`을 읽는 쪽이 설정 변화에 덜 민감하다.
