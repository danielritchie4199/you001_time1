## 📚 API 엔드포인트(API Endpoint)의 정의

### 🎯 API 엔드포인트란?

**API 엔드포인트**는 클라이언트(프론트엔드)가 서버(백엔드)와 통신하기 위한 **특정 URL 주소**입니다. 

쉽게 말해, **"서버에 요청을 보낼 수 있는 문의 창구"**라고 생각하시면 됩니다.

### 🔍 구체적인 정의

1. **URL 경로**: 특정 기능을 수행하는 서버의 주소
2. **HTTP 메서드**: GET, POST, PUT, DELETE 등의 요청 방식
3. **데이터 처리**: 요청을 받아 처리하고 응답을 반환하는 로직

### 📝 일반적인 형태

```
HTTP메서드 + 서버주소 + 경로
POST http://localhost:3000/api/trending-keywords
```

## 🎯 이번 소스에서의 API 엔드포인트

### 1️⃣ 위치: `server.js` 2700행

```javascript
app.post('/api/trending-keywords', async (req, res) => {
  // 인기검색어 분석 로직
});
```

### 2️⃣ 구성 요소 분석

#### 📍 **URL 경로**: `/api/trending-keywords`

- `api`: API 관련 요청임을 나타내는 접두사
- `trending-keywords`: 인기검색어 기능을 의미

#### 📬 **HTTP 메서드**: `POST`

- 데이터를 서버로 전송하여 처리 요청
- 클라이언트에서 `{ count: 20, videoCount: 100 }` 같은 데이터 전송

#### 🔄 **처리 로직**:

1. YouTube API로 인기 동영상 수집
2. 키워드 추출 및 빈도 분석
3. 불용어 필터링
4. 결과를 JSON 형태로 응답

### 3️⃣ 클라이언트에서의 호출

#### 📍 위치: `you_list.html` 2637행

```javascript
const response = await fetch('/api/trending-keywords', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        count: count,
        videoCount: count * 5
    })
});
```

## 🔗 전체 통신 흐름

```
사용자 → [🔍 버튼 클릭] → JavaScript → [POST /api/trending-keywords] → 서버 → YouTube API → 키워드 분석 → 응답 → 모달창 표시
```

### 📊 요청/응답 데이터

#### 📤 **요청 데이터** (클라이언트 → 서버)

```json
{
  "count": 20,
  "videoCount": 100
}
```

#### 📥 **응답 데이터** (서버 → 클라이언트)

```json
{
  "success": true,
  "keywords": [
    {"word": "게임", "frequency": 45},
    {"word": "리뷰", "frequency": 32}
  ],
  "videoCount": 100,
  "analysisInfo": "100개 동영상에서 20개 키워드 분석 완료"
}
```

## 🎯 요약

**API 엔드포인트**는 이번 프로젝트에서:

- **서버 측**: `server.js` 2700행의 `app.post('/api/trending-keywords', ...)`
- **클라이언트 측**: `you_list.html` 2637행의 `fetch('/api/trending-keywords', ...)`
- **기능**: 헤더의 🔍 버튼 클릭 시 인기검색어 분석을 수행하는 통신 창구

즉, 프론트엔드와 백엔드가 데이터를 주고받기 위한 **약속된 통신 규칙**입니다.
