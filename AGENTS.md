# iwlisten Repository Guide

이 파일은 이 저장소에서 작업할 때 기본으로 따라야 하는 전역 운영 규칙이다.

## Cloudflare Pages + D1

- Pages 배포 대상 프로젝트명은 항상 `iwlisten`으로 통일한다.
- Pages 배포 워크플로는 하나만 유지한다. 중복 배포 workflow를 만들지 않는다.
- `wrangler.toml`의 D1 `database_id`에 플레이스홀더를 남기지 않는다.
- Pages 배포 전 `JWT_SECRET`이 Pages secret에 등록되어 있는지 먼저 확인한다.
- 새 기능을 D1에 붙이기 전 Cloudflare 계정의 D1 개수 한도를 먼저 확인한다.

## GitHub Actions

- Cloudflare 배포에는 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`가 모두 필요하다.
- 플랫폼 전환 후에는 예전 배포 workflow를 바로 제거해 실패 노이즈를 없앤다.
- 웹 버전, 서비스워커 캐시 버전, APK 버전, GitHub Release 태그는 분리 관리하지 말고 한 스크립트에서 같이 스탬프한다.

## Android App

- 공식 APK 빌드 대상은 `webview-apk`다.
- 기존 `android/` Capacitor 경로와 새 `webview-apk` 경로를 혼용하지 않는다.
- Gradle Kotlin DSL 수정 시 `settings.gradle.kts`의 DSL 이름을 먼저 검증한다.
- 앱 버전 비교는 가능하면 런타임 `packageManager`의 `versionName` 기준으로 처리한다.

## Delivery Checklist

- 변경 후 `main` 푸시 시 Cloudflare Pages 배포와 APK 릴리스가 동시에 기대대로 도는지 확인한다.
- 배포 실패 시 먼저 GitHub Actions 로그에서 시크릿 누락, D1 UUID, Gradle 설정 오류를 확인한다.
- 사용자가 "전역 규칙" 또는 "앞으로도 적용"을 요청하면 이 파일을 우선 갱신한다.
