## 🌍 "전세계" 선택 시 YouTube API V3 의 동작 방식

### 📋 결론: 전세계 선택 시 어떤 국가를 기준으로 하는가?

"전세계"를 선택하면 특정 국가를 기준으로 하지 않습니다. 대신 다음과 같이 처리됩니다:

### 🎯 전세계 검색의 실제 처리 방식

#### 1️⃣ regionCode 제거

javascript

// server.js 809행

console.log('🌍 전세계 검색: regionCode 없이 진행');

// regionCode를 설정하지 않음

#### 2️⃣ 언어 설정

javascript

// server.js 1813행

'worldwide': 'en', // 전세계는 영어 기본

- 기본 언어: 영어(en)로 설정

- relevanceLanguage: 'en' 파라미터 적용

#### 3️⃣ 검색 키워드 (키워드 없는 경우)

javascript

// server.js 890-892행

const broadSearchTerms = ['a', 'the', 'and', 'or', 'video', 'youtube'];

const randomTerm = broadSearchTerms[Math.floor(Math.random() * broadSearchTerms.length)];

searchParams.q = randomTerm;

- 무작위 검색어: 'a', 'the', 'and', 'or', 'video', 'youtube' 중 하나

- 정렬 방식: 조회수 높은 순(viewCount)

#### 4️⃣ YouTube API 파라미터

javascript

{

  regionCode: undefined,        // 지역 제한 없음

  relevanceLanguage: 'en',      // 영어 기본

  order: 'viewCount',           // 조회수 순

  q: 'random_search_term'       // 무작위 검색어

}

###### 🔍 YouTube API의 동작 방식

regionCode가 없을 때 YouTube API는:

1. 글로벌 동영상 풀에서 검색

2. 영어 콘텐츠 우선 (relevanceLanguage: 'en')

3. 조회수 기준 정렬로 전세계적으로 인기 있는 동영상 반환

### 📊 실제 결과

전세계 선택 시 주로 다음과 같은 동영상들이 나타납니다:

1. 영어권 콘텐츠 (미국, 영국 등)

2. 전세계적으로 인기 있는 콘텐츠

3. 언어에 관계없이 조회수가 높은 동영상

4. K-pop, 음악 등 언어 장벽이 낮은 콘텐츠

### 🎯 요약

"전세계" 선택 = 특정 국가 기준 없음 + 영어 우선 + 조회수 기준 글로벌 검색

즉, 어떤 한 국가를 기준으로 하는 것이 아니라, YouTube의 전체 동영상 데이터베이스에서 조회수가 높은 콘텐츠를 영어 우선으로 검색하는 방식입니다.
