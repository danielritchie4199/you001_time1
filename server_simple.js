const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const axios = require('axios');
const XLSX = require('xlsx');
const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

console.log('🚀 YouTube 검색 서버 시작...');

// Elasticsearch 클라이언트 설정
let esClient = null;
try {
  esClient = new Client({ node: process.env.ES_NODE || 'http://localhost:9200' });
  console.log('✅ Elasticsearch 클라이언트 초기화 완료');
} catch (error) {
  console.warn('⚠️ Elasticsearch 연결 실패, YouTube API만 사용:', error.message);
  esClient = null;
}

// Express 앱 초기화
const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// ==================== 유틸리티 함수들 ====================

// 국가 코드 매핑
function getCountryCode(country) {
  const countryMap = {
    'worldwide': null,
    'korea': 'KR', 'usa': 'US', 'japan': 'JP', 'china': 'CN',
    'uk': 'GB', 'germany': 'DE', 'france': 'FR', 'canada': 'CA',
    'australia': 'AU', 'india': 'IN', 'brazil': 'BR', 'mexico': 'MX',
    'italy': 'IT', 'spain': 'ES'
  };
  return countryMap[country.toLowerCase()] || null;
}

// 언어 코드 매핑
function getLanguageCode(country) {
  const languageMap = {
    'worldwide': 'en', 'korea': 'ko', 'usa': 'en', 'japan': 'ja',
    'china': 'zh', 'uk': 'en', 'germany': 'de', 'france': 'fr',
    'canada': 'en', 'australia': 'en', 'india': 'en', 'brazil': 'pt',
    'mexico': 'es', 'italy': 'it', 'spain': 'es'
  };
  return languageMap[country.toLowerCase()] || 'en';
}

// 날짜 범위 계산
function getDateRange(period) {
  const now = new Date();
  let publishedAfter = null;
  
  switch (period) {
    case '1day':
      publishedAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '1week':
      publishedAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '1month':
      publishedAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '3months':
      publishedAfter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1year':
      publishedAfter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
  }
  
  return {
    publishedAfter: publishedAfter ? publishedAfter.toISOString() : null,
    publishedBefore: null
  };
}

// ==================== 간단한 Rate Limiting ====================
const requestTracker = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15분
const RATE_LIMIT_MAX_REQUESTS = 100; // 15분당 최대 100회

function rateLimitMiddleware(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  let requests = requestTracker.get(clientIP) || [];
  requests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: '검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      retryAfter: Math.ceil((requests[0] + RATE_LIMIT_WINDOW - now) / 1000)
    });
  }
  
  requests.push(now);
  requestTracker.set(clientIP, requests);
  next();
}

// ==================== API 키 관리자 ====================
class ApiKeyManager {
  constructor() {
    this.apiKeys = [];
    this.currentKeyIndex = 0;
    
    // 기본 API 키 설정 (환경변수에서 로드)
    const primaryKey = process.env.YOUTUBE_API_KEY;
    if (primaryKey && primaryKey !== 'your_api_key_here') {
      this.apiKeys.push({
        key: primaryKey,
        index: 1,
        name: 'PRIMARY_KEY',
        usageCount: 0,
        quotaExceeded: false
      });
    }
    
    if (this.apiKeys.length === 0) {
      console.warn('⚠️ YouTube API 키가 설정되지 않았습니다. .env 파일을 확인하세요.');
    } else {
      console.log(`✅ ${this.apiKeys.length}개의 YouTube API 키 설정 완료`);
    }
  }
  
  getCurrentKey() {
    const availableKeys = this.apiKeys.filter(key => !key.quotaExceeded);
    if (availableKeys.length === 0) return null;
    
    const key = availableKeys[this.currentKeyIndex % availableKeys.length];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % availableKeys.length;
    return key;
  }
  
  getYouTubeInstance() {
    const currentKey = this.getCurrentKey();
    if (!currentKey) {
      throw new Error('사용 가능한 YouTube API 키가 없습니다.');
    }
    
    currentKey.usageCount++;
    const youtube = google.youtube({ version: 'v3', auth: currentKey.key });
    
    return {
      youtube: youtube,
      currentKey: currentKey
    };
  }
}

// ==================== API 매니저 인스턴스 생성 ====================
let apiKeyManager;
try {
  apiKeyManager = new ApiKeyManager();
} catch (error) {
  console.error('❌ API 키 매니저 초기화 실패:', error.message);
  apiKeyManager = null;
}

// ==================== 라우트 정의 ====================

// 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'you_list.html'));
});

// 테스트 API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'YouTube 검색 서버가 정상 작동합니다!',
    timestamp: new Date().toISOString(),
    apiKeysAvailable: apiKeyManager ? apiKeyManager.apiKeys.length : 0
  });
});

// 간단한 검색 API (기본 기능만)
app.get('/api/search', rateLimitMiddleware, async (req, res) => {
  try {
    if (!apiKeyManager) {
      return res.status(500).json({
        success: false,
        error: 'YouTube API 키가 설정되지 않았습니다.'
      });
    }
    
    const { keyword = '', country = 'worldwide', maxResults = 20 } = req.query;
    
    // 기본 검색 파라미터
    let searchParams = {
      part: 'snippet',
      type: 'video',
      maxResults: Math.min(parseInt(maxResults), 50),
      order: 'viewCount'
    };
    
    if (keyword.trim()) {
      searchParams.q = keyword.trim();
    } else {
      searchParams.q = 'popular video';
    }
    
    // 국가별 설정
    if (country !== 'worldwide') {
      const regionCode = getCountryCode(country);
      if (regionCode) {
        searchParams.regionCode = regionCode;
      }
      
      const languageCode = getLanguageCode(country);
      if (languageCode) {
        searchParams.relevanceLanguage = languageCode;
      }
    }
    
    console.log('🔍 검색 시작:', { keyword, country, maxResults });
    
    // YouTube API 호출
    const youtubeInstance = apiKeyManager.getYouTubeInstance();
    const response = await youtubeInstance.youtube.search.list(searchParams);
    
    if (!response.data.items || response.data.items.length === 0) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        message: '검색 결과가 없습니다.'
      });
    }
    
    // 비디오 ID 수집
    const videoIds = response.data.items.map(item => item.id.videoId);
    
    // 비디오 상세 정보 가져오기
    const videoDetails = await youtubeInstance.youtube.videos.list({
      part: 'snippet,statistics,contentDetails',
      id: videoIds.join(',')
    });
    
    // 결과 데이터 구성
    const results = videoDetails.data.items.map(video => ({
      video_id: video.id,
      title: video.snippet.title,
      youtube_channel_name: video.snippet.channelTitle,
      youtube_channel_id: video.snippet.channelId,
      thumbnail_url: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default?.url,
      vod_url: `https://www.youtube.com/watch?v=${video.id}`,
      daily_view_count: parseInt(video.statistics.viewCount || 0),
      status_date: video.snippet.publishedAt,
      description: video.snippet.description,
      duration: video.contentDetails.duration,
      primary_category: 'Entertainment',
      status: 'active',
      country: country
    }));
    
    console.log(`✅ 검색 완료: ${results.length}개 결과`);
    
    res.json({
      success: true,
      data: results,
      total: results.length,
      source: 'youtube_api'
    });
    
  } catch (error) {
    console.error('❌ 검색 오류:', error.message);
    
    res.status(500).json({
      success: false,
      error: '검색 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ==================== 서버 시작 ====================
app.listen(PORT, () => {
  console.log('\n🎉 ═══════════════════════════════════════');
  console.log(`🚀 YouTube 검색 서버 시작 완료!`);
  console.log(`📍 포트: ${PORT}`);
  console.log(`🌐 메인 페이지: http://localhost:${PORT}`);
  console.log(`🧪 테스트 API: http://localhost:${PORT}/api/test`);
  console.log(`🔍 검색 API: http://localhost:${PORT}/api/search?keyword=test`);
  console.log('═══════════════════════════════════════\n');
  
  if (apiKeyManager && apiKeyManager.apiKeys.length > 0) {
    console.log('✅ YouTube API 준비 완료');
  } else {
    console.log('⚠️ YouTube API 키를 .env 파일에 설정하세요:');
    console.log('   YOUTUBE_API_KEY=your_api_key_here');
  }
});

// 프로세스 종료 처리
process.on('SIGINT', () => {
  console.log('\n👋 서버를 종료합니다...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 치명적 오류:', error.message);
  console.error('서버를 안전하게 종료합니다...');
  process.exit(1);
});

console.log('🔧 서버 설정 완료, 포트 대기 중...');
