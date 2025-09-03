 YouTube API v3 에서 가져오는 채널의 국적 정보와 검색 필터의 국가는 완전히 다른 개념입니다.

## 🔍 YouTube API V3 두 가지 "국가" 정보의 차이점

### 1️⃣ 검색 필터의 국가 (regionCode)

- 용도: 검색 범위를 특정 지역으로 제한

- 의미: "어느 지역에서 인기 있는 동영상을 찾을 것인가?"

- API 파라미터: regionCode (예: 'KR', 'US', 'JP')

- 영향: 해당 지역에서 인기 있거나 관련성 높은 동영상 우선 표시

### 2️⃣ 채널의 국적 정보 (snippet.country)

- 용도: 채널 소유자/크리에이터의 실제 국적

- 의미: "이 채널을 운영하는 사람/회사는 어느 나라 출신인가?"

- API 응답: channels.list의 snippet.country 또는 brandingSettings.channel.country

- 특징: 채널 소유자가 직접 설정하거나 YouTube가 추정

## 📊 실제 예시

javascript

// 검색 필터 (regionCode)

searchParams = {

  regionCode: 'KR',  // 한국에서 인기 있는 동영상 검색

  q: 'music'

}

// 검색 결과로 나온 채널들의 실제 국적

결과1: 미국 아티스트 채널 (snippet.country: 'US') - 하지만 한국에서 인기

결과2: 한국 가수 채널 (snippet.country: 'KR') 

결과3: 일본 밴드 채널 (snippet.country: 'JP') - 하지만 한국에서 인기

## ## 🎯 현재 코드에서의 처리

Readserver.js L1260-1265

현재 코드에서는 primaryCountry (검색 필터 국가)를 사용하고 있습니다.

## ⚠️ 현재 상황의 문제점

현재 엑셀의 "국적"과 "국가" 컬럼이 둘 다 같은 값 (result.country)을 사용하고 있습니다:

javascript

'국적': result.country || '',  // 검색 필터 국가

'국가': result.country || '',  // 검색 필터 국가 (중복)

## 🔧 올바른 구분 방법

실제 채널 국적을 가져오려면 YouTube API의 channels.list에서 다음 정보를 사용해야 합니다:

1. snippet.country: 채널의 국가 정보

2. brandingSettings.channel.country: 브랜딩 설정의 국가 정보

## 📋 권장 수정사항

- "국적": 실제 채널 소유자의 국적 (snippet.country)

- "국가": 검색 필터로 사용한 지역 (primaryCountry)



"unknown"으로 나오는 이유는 여러 가지가 있습니다.

## 🔍 "unknown" 국적이 나오는 원인들

### 1️⃣ 채널 소유자가 국적을 공개하지 않음 (가장 일반적)

- YouTube 채널 설정에서 국가 정보를 비공개로 설정

- 프라이버시 보호를 위해 의도적으로 숨김

### 2️⃣ API 응답에서 국적 필드가 없음

- YouTube API가 모든 채널에 대해 국적 정보를 제공하지 않음

- 특히 오래된 채널이나 개인 채널에서 자주 발생

### 3️⃣ 채널 유형별 차이

- 기업/브랜드 채널: 국적 정보를 설정하지 않는 경우가 많음

- 개인 채널: 프라이버시상 국적을 공개하지 않음

- 음악/엔터테인먼트 채널: 글로벌 전략으로 국적을 명시하지 않음

### 4️⃣ API 권한/접근 제한

- 특정 채널에 대한 상세 정보 접근 권한이 제한됨

- brandingSettings 파트에 접근할 수 없는 경우

## 📊 실제 데이터 확인

현재 코드에서 국적 정보를 가져오는 순서를 확인해보겠습니다:

Readserver.js L1980-1990

## ## 🎯 YouTube API의 국적 필드 제공 현황

YouTube Data API v3에서 국적 정보는:

1. snippet.country: 채널의 공개 국가 정보

2. brandingSettings.channel.country: 브랜딩 설정의 국가 정보

이 두 필드 모두 선택적(optional)이며, 채널 소유자가 설정하지 않으면 API 응답에 포함되지 않습니다.

## 📈 실제 통계 예상

일반적으로:

- 개인 채널: 70-80%가 국적 정보 비공개

- 기업 채널: 50-60%가 국적 정보 비공개

- 공식 아티스트/셀럽 채널: 30-40%가 국적 정보 공개

## 🔧 개선 방안 (선택적)

더 정확한 국적 추정을 원한다면:

1. 채널명 분석: 언어/문자 패턴으로 추정

2. 동영상 언어 분석: 제목/설명의 주요 언어

3. 지역별 인기도: 어느 지역에서 주로 인기인지 분석

하지만 이는 추정일 뿐이므로, "unknown"이 정확한 표현입니다.
