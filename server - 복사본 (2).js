const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const axios = require('axios');
const XLSX = require('xlsx');
const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

// Elasticsearch 클라이언트 설정
let esClient = null;
try {
  esClient = new Client({ node: process.env.ES_NODE || 'http://localhost:9200' });
  console.log('Elasticsearch 클라이언트 초기화 완료');
} catch (error) {
  console.warn('Elasticsearch 연결 실패, YouTube API만 사용:', error.message);
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

// YouTube Analytics 캐시 관리 API
app.get('/api/analytics-cache/stats', (req, res) => {
  try {
    const stats = analyticsManager.getCacheStats();
    
    res.json({
      success: true,
      cacheStats: stats,
      cacheTimeout: analyticsManager.cacheTimeout / (60 * 60 * 1000) + '시간'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

// YouTube 동영상 검색 API
app.get('/api/search', rateLimitMiddleware, async (req, res) => {
  const searchStartTime = Date.now(); // 검색 시작 시간 기록
  
  try {
    const {
      country = 'worldwide',  // 기본값을 전세계로 변경
      countries = '',         // 다중 국가 선택 파라미터 추가
      keyword = '',
      searchScope = 'title',  // 검색 범위: title, channel, 또는 분리된 문자열
      maxViews,
      minViews = 100000,
      uploadPeriod,
      startDate,
      endDate,
      videoLength,
      maxResults = 60,   // 기본값 60건
      categories = ''   // 카테고리 필터
    } = req.query;

    // maxResults 유효성 검사 및 conversion
    const allowedResults = [10, 20, 30, 40, 50, 60, 100, 150, 200];
    const parsedMaxResults = parseInt(maxResults);
    const finalMaxResults = allowedResults.includes(parsedMaxResults) ? parsedMaxResults : 60;

    console.log('검색 파라미터:', req.query);
    console.log('선택된 국가(단수):', country);
    console.log('선택된 국가들(복수):', countries);
    
    // 다중 국가 처리 로직 개선
    let selectedCountries;
    if (countries && countries.length > 0) {
      // countries 파라미터가 있으면 우선 사용
      if (Array.isArray(countries)) {
        selectedCountries = countries.filter(c => c && c.trim());
      } else if (typeof countries === 'string') {
        selectedCountries = countries.split(',').filter(c => c.trim());
      } else {
        selectedCountries = [country];
      }
    } else {
      // countries가 없으면 country 사용
      selectedCountries = [country];
    }
    
    // 중복 제거 및 유효성 검사
    selectedCountries = [...new Set(selectedCountries.filter(c => c && c.trim()))];
    if (selectedCountries.length === 0) {
      selectedCountries = ['worldwide'];
    }
    
    console.log('최종 처리할 국가 목록:', selectedCountries);
    
    console.log('검색 범위:', searchScope);
    console.log('선택된 카테고리:', categories);
    console.log(`검색 결과 수: ${finalMaxResults}건 (요청: ${maxResults})`);

    // 동영상 길이 파라미터 파싱
    const selectedVideoLengths = videoLength && videoLength.trim() ? videoLength.split(',').filter(v => v.trim()) : [];
    console.log('선택된 동영상 길이:', selectedVideoLengths.length > 0 ? selectedVideoLengths : '모든 길이 허용 (필터 없음)');

    // 다중 국가 처리: 첫 번째 국가를 기준으로 설정 (향후 확장 가능)
    const primaryCountry = selectedCountries[0];
    console.log(`🎯 주 검색 국가: ${primaryCountry} (총 ${selectedCountries.length}개국 선택됨)`);

    // ========== Elasticsearch 캐시 우선 로직 시작 ==========
    const searchParameters = {
      country: primaryCountry,        // 주 검색 국가
      countries: selectedCountries.join(','), // 선택된 모든 국가 목록
      keyword,
      searchScope,
      categories,
      minViews,
      maxViews,
      uploadPeriod,
      startDate,
      endDate,
      videoLength,
      maxResults: finalMaxResults,
      // 날짜 범위 정보 추가
      publishedAfter: null,
      publishedBefore: null
    };
    
    // 날짜 범위 정보 추가 (Elasticsearch 캐시 비교용)
    if (uploadPeriod) {
      const dateRange = getDateRange(uploadPeriod);
      searchParameters.publishedAfter = dateRange.publishedAfter;
      searchParameters.publishedBefore = dateRange.publishedBefore;
    } else if (startDate || endDate) {
      if (startDate) {
        try {
          const startDateTime = new Date(startDate + 'T00:00:00.000Z');
          searchParameters.publishedAfter = startDateTime.toISOString();
        } catch (e) {
          console.warn('시작일 파싱 오류:', e.message);
        }
      }
      if (endDate) {
        try {
          const endDateTime = new Date(endDate + 'T23:59:59.999Z');
          searchParameters.publishedBefore = endDateTime.toISOString();
        } catch (e) {
          console.warn('종료일 파싱 오류:', e.message);
        }
      }
    }
    
    // 1단계: 캐시 히트 확인
    console.log('🔍 Elasticsearch 캐시 확인 중...');
    const cacheResult = await esHelper.checkCacheHit(searchParameters);
    console.log('📊 캐시 확인 결과:', cacheResult);
    
    if (cacheResult.hit) {
      // 캐시 히트: ES에서 결과 조회
      console.log('✅ 캐시 히트! Elasticsearch에서 결과 조회');
      const cachedResults = await esHelper.searchVideos(searchParameters);
      
      if (cachedResults && cachedResults.length > 0) {
        console.log(`📦 캐시에서 ${cachedResults.length}개 결과 반환`);
        
        // 캐시 검색 소요시간 계산
        const cacheEndTime = Date.now();
        const cacheDuration = cacheEndTime - searchStartTime;
        const cacheDurationSeconds = (cacheDuration / 1000).toFixed(2);
        
        console.log(`\n⏱️ 캐시 검색 완료: 총 소요시간 ${cacheDurationSeconds}초 (${cachedResults.length}개 결과)`);
        console.log(`🔍 검색 조건: ${country}/${keyword || '키워드 없음'}/${finalMaxResults}건`);
        console.log('⚡ 캐시 히트로 초고속 검색!');
        console.log('='.repeat(52));
        
        return res.json({
          success: true,
          data: cachedResults,
          total: cachedResults.length,
          source: 'elasticsearch_cache',
          searchDuration: `${cacheDurationSeconds}초`
        });
      } else {
        console.log('⚠️ 캐시 히트였지만 결과가 없음, YouTube API로 fallback');
      }
    } else {
      console.log('❌ 캐시 미스:', cacheResult.reason);
      console.log('🔄 YouTube API 호출로 진행');
    }
    // ========== Elasticsearch 캐시 우선 로직 끝 ==========

    let searchResults = [];
    let nextPageToken = '';
    const resultsPerPage = Math.min(finalMaxResults, 50); // 선택한 결과 수에 따라 페이지당 요청량 조정

    // YouTube API 검색 파라미터 설정
    let searchParams = {
      part: 'snippet',
      type: 'video',
      maxResults: resultsPerPage,
      order: 'viewCount'
    };

    // primaryCountry는 이미 위에서 선언되었으므로 사용만 하기
    
    // 국가별 지역 코드 설정 (전세계가 아닌 경우에만)
    if (primaryCountry !== 'worldwide') {
      const regionCode = getCountryCode(primaryCountry);
      if (regionCode) {
        searchParams.regionCode = regionCode;
        console.log(`✅ 지역 코드 설정: ${primaryCountry} → ${regionCode}`);
      } else {
        console.log(`⚠️ 경고: '${primaryCountry}' 국가의 regionCode를 찾을 수 없어 전세계 검색으로 진행합니다.`);
      }
    } else {
      console.log('🌍 전세계 검색: regionCode 없이 진행');
    }

    // 언어 설정 (주 검색 국가의 기본 언어)
    const languageCode = getLanguageCode(primaryCountry);
    if (languageCode) {
      searchParams.relevanceLanguage = languageCode;
      console.log(`🌐 언어 설정: ${primaryCountry} → ${languageCode}`);
    }

    // 키워드 설정 (검색 범위 포함)
    const isEmptyKeyword = !keyword || !keyword.trim();
    
    if (!isEmptyKeyword) {
      // 검색 범위에 따른 쿼리 구성 (타입 안전성 확보)
      let searchScopes = ['title']; // 기본값
      
      if (searchScope) {
        if (typeof searchScope === 'string') {
          searchScopes = searchScope.split(',').map(s => s.trim()).filter(s => s);
        } else if (Array.isArray(searchScope)) {
          searchScopes = searchScope.map(s => String(s).trim()).filter(s => s);
        } else {
          console.log('검색 범위 타입 오류, 기본값 사용:', typeof searchScope, searchScope);
        }
      }
      
      let searchQuery = keyword.trim();
      
      // YouTube API에서 태그 검색을 위한 특별 처리
      if (searchScopes.includes('tags')) {
        // 태그 검색을 위해 hashtag나 특정 형식 사용
        searchQuery = `${searchQuery} tags`;
        console.log(`태그 포함 검색: "${searchQuery}"`);
      }
      
      // 채널명 검색이 포함된 경우
      if (searchScopes.includes('channel')) {
        searchQuery = `${searchQuery} channel`;
        console.log(`채널명 포함 검색: "${searchQuery}"`);
      }
      
      searchParams.q = searchQuery;
      console.log(`키워드 검색 (범위: ${searchScopes.join(', ')}): "${searchQuery}"`);
    } else {
      // 키워드가 없을 때는 국가별 인기 동영상 검색
      console.log('키워드 없음: 국가별 인기 동영상 검색');
      
      if (country !== 'worldwide') {
        // 특정 국가 선택 시: 해당 국가의 인기 콘텐츠 검색
        console.log(`🏳️ ${country} 국가의 인기 동영상 검색`);
        
        // 국가별 인기 검색어 사용 (더 정확한 지역별 결과)
        const countrySpecificTerms = {
          'korea': ['한국', 'korean', 'korea', '한국어'],
          'usa': ['america', 'usa', 'american', 'english'],
          'japan': ['japan', 'japanese', '일본', '일본어'],
          'uk': ['britain', 'uk', 'british', 'english'],
          'germany': ['germany', 'german', 'deutsch', '독일'],
          'france': ['france', 'french', 'français', '프랑스'],
          'canada': ['canada', 'canadian', 'english', 'french'],
          'australia': ['australia', 'australian', 'english'],
          'india': ['india', 'indian', 'hindi', 'english'],
          'brazil': ['brazil', 'brazilian', 'portuguese', 'português'],
          'mexico': ['mexico', 'mexican', 'spanish', 'español'],
          'italy': ['italy', 'italian', 'italiano', '이탈리아'],
          'spain': ['spain', 'spanish', 'español', '스페인']
        };
        
        const terms = countrySpecificTerms[country] || ['video', 'popular'];
        const randomTerm = terms[Math.floor(Math.random() * terms.length)];
        searchParams.q = randomTerm;
        
        // 국가별 검색을 위해 order를 relevance로 설정 (regionCode와 relevanceLanguage가 우선 적용됨)
        searchParams.order = 'relevance';
        
        console.log(`🌍 ${country} 국가별 인기 검색어: "${randomTerm}"`);
        console.log('설정: 관련성 순서로 정렬 (국가별 우선)');
      } else {
        // 전세계 선택 시: 일반적인 인기 동영상 검색
        console.log('🌍 전세계 인기 동영상 검색');
        
        const broadSearchTerms = ['a', 'the', 'and', 'or', 'video', 'youtube'];
        const randomTerm = broadSearchTerms[Math.floor(Math.random() * broadSearchTerms.length)];
        searchParams.q = randomTerm;
        
        // 전세계 검색 시에만 조회수 순 정렬
        searchParams.order = 'viewCount';
        
        console.log(`전세계 인기 동영상 검색어: "${randomTerm}"`);
        console.log('설정: 조회수 높은 순서로 정렬');
      }
    }

    // 디버그 로그 출력 (키워드 설정 후)
    console.log('=== 국가별 검색 디버그 정보 ===');
    console.log('1. 클라이언트 요청 country:', country);
    console.log('2. getCountryCode 결과:', getCountryCode(country));
    console.log('3. getLanguageCode 결과:', getLanguageCode(country));
    console.log('4. 키워드 상태:', keyword ? `"${keyword}"` : '없음 (국가별 인기 검색)');
    console.log('5. 검색 전략:', keyword ? '키워드 기반 검색' : (country === 'worldwide' ? '전세계 인기 검색' : `${country} 국가별 인기 검색`));
    console.log('6. 최종 YouTube API 검색 파라미터:', {
      regionCode: searchParams.regionCode || '없음 (전세계 검색)',
      relevanceLanguage: searchParams.relevanceLanguage,
      country: country,
      keyword: searchParams.q || '키워드 없음',
      order: searchParams.order,
      type: searchParams.type,
      isWorldwide: country === 'worldwide'
    });
    console.log('7. 검색 타입:', country === 'worldwide' ? '🌍 전세계 검색' : `🏳️ ${country} 국가별 검색`);
    console.log('========================================');

    // 업로드 기간 설정 (기존 드롭다운 방식)
    if (uploadPeriod) {
      const { publishedAfter, publishedBefore } = getDateRange(uploadPeriod);
      if (publishedAfter) searchParams.publishedAfter = publishedAfter;
      if (publishedBefore) searchParams.publishedBefore = publishedBefore;
    }

    // 커스텀 날짜 범위 설정 (startDate, endDate가 있으면 uploadPeriod보다 우선)
    if (startDate || endDate) {
      if (startDate) {
        try {
          const startDateTime = new Date(startDate + 'T00:00:00.000Z'); // UTC 기준으로 명시적 처리
          if (isNaN(startDateTime.getTime())) {
            throw new Error('Invalid start date');
          }
          searchParams.publishedAfter = startDateTime.toISOString();
          console.log('✅ 시작일 설정 성공 (UTC):', startDateTime.toISOString());
        } catch (error) {
          console.error('❌ 시작일 처리 오류:', error.message, '입력값:', startDate);
          // 오류 시 시작일 무시하고 계속 진행
        }
      }
      if (endDate) {
        try {
          const endDateTime = new Date(endDate + 'T23:59:59.999Z'); // UTC 기준으로 명시적 처리
          if (isNaN(endDateTime.getTime())) {
            throw new Error('Invalid end date');
          }
          searchParams.publishedBefore = endDateTime.toISOString();
          console.log('✅ 종료일 설정 성공 (UTC):', endDateTime.toISOString());
        } catch (error) {
          console.error('❌ 종료일 처리 오류:', error.message, '입력값:', endDate);
          // 오류 시 종료일 무시하고 계속 진행
        }
      }
      console.log('📅 커스텀 날짜 범위 적용:', {
        startDate: startDate || '없음',
        endDate: endDate || '없음',
        publishedAfter: searchParams.publishedAfter || '없음',
        publishedBefore: searchParams.publishedBefore || '없음'
      });
    }

    // 동영상 길이 설정 (YouTube API는 'short', 'medium', 'long'만 지원하므로 후처리에서 필터링)
    // videoLength 파라미터는 클라이언트에서 받아서 결과 필터링에 사용

    // 선택한 수만큼 결과 수집 (중복 제거)
    const processedVideoIds = new Set(); // 이미 처리된 비디오 ID 추적
    const processedChannelTitles = new Set(); // 이미 처리된 채널명 추적 (선택적)
    
    while (searchResults.length < finalMaxResults) {
      if (nextPageToken) {
        searchParams.pageToken = nextPageToken;
      }

      let response;
      let currentApiKey = apiKeyManager.getCurrentKey();
      
      // 견고한 API 키 전환 로직으로 재작성
      let retryCount = 0;
      const maxRetries = apiKeyManager.apiKeys.length;
      
      while (retryCount < maxRetries) {
        try {
          const youtubeInstance = apiKeyManager.getYouTubeInstance();
          currentApiKey = youtubeInstance.currentKey;
          response = await youtubeInstance.youtube.search.list(searchParams);
          break; // 성공하면 루프 종료
        } catch (apiError) {
          console.error(`YouTube API 오류 (${currentApiKey.name}):`, apiError.message);
          
          // 할당량 초과 오류인 경우 다음 키로 전환
          if (apiError.message.includes('quota') || apiError.message.includes('quotaExceeded')) {
            console.log(`🚫 ${currentApiKey.name} 할당량 초과 감지`);
            
            const newApiKey = apiKeyManager.markKeyAsQuotaExceeded(currentApiKey);
            if (newApiKey) {
              console.log(`🔄 ${newApiKey.name}로 재시도합니다... (재시도 ${retryCount + 1}/${maxRetries})`);
              retryCount++;
              continue; // 다음 반복으로 계속
            } else {
              console.log('❌ 모든 API 키의 할당량이 초과되었습니다.');
              throw new Error('ALL_QUOTA_EXCEEDED: 모든 API 키의 할당량이 초과되었습니다.');
            }
          }
          // regionCode 관련 오류인 경우 처리
          else if ((apiError.message.includes('regionCode') || apiError.message.includes('invalid region')) && searchParams.regionCode) {
            console.log('🚨 regionCode 오류 발생!');
            console.log(`  - 요청한 국가: ${country}`);
            console.log(`  - 사용한 regionCode: ${searchParams.regionCode}`);
            console.log(`  - 오류 메시지: ${apiError.message}`);
            
            const originalRegionCode = searchParams.regionCode;
            delete searchParams.regionCode;
            
            console.log('  🔄 전세계 검색으로 재시도합니다...');
            
            const youtube = google.youtube({ 
              version: 'v3', 
              auth: currentApiKey.key,
              timeout: 30000 // 30초 타임아웃
            });
            response = await youtube.search.list(searchParams);
            console.log('  ✅ 전세계 검색으로 성공');
            console.log(`  ⚠️  주의: "${country}" 검색이 전세계 검색으로 변경되었습니다.`);
            break; // 성공하면 루프 종료
          } else {
            console.log('복구할 수 없는 API 오류:', apiError.message);
            throw apiError; // 다른 오류는 그대로 전파
          }
        }
      }
      
      // 최대 재시도 횟수 초과 시
      if (retryCount >= maxRetries && !response) {
        throw new Error('MAX_RETRIES_EXCEEDED: 모든 API 키 재시도 실패');
      }
      
      if (!response.data.items || response.data.items.length === 0) {
        break;
      }
      
      console.log(`API 응답: ${response.data.items.length}개 동영상 발견`);

      // 비디오 ID 수집
      const videoIds = response.data.items.map(item => item.id.videoId);
      
      // 나머지 검색 로직 계속...
  }
});

// YouTube Analytics 캐시 관리 API
app.get('/api/analytics-cache/stats', (req, res) => {
  try {
    const stats = analyticsManager.getCacheStats();
    
    res.json({
      success: true,
      cacheStats: stats,
      cacheTimeout: analyticsManager.cacheTimeout / (60 * 60 * 1000) + '시간'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

app.post('/api/analytics-cache/clear', (req, res) => {
  try {
    analyticsManager.clearCache();
    
    res.json({
      success: true,
      message: 'YouTube Analytics 캐시가 모두 정리되었습니다.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 정리에 실패했습니다.',
      details: error.message
    });
  }
});

// YouTube Analytics 캐시 관리 API
app.get('/api/analytics-cache/stats', (req, res) => {
  try {
    const stats = analyticsManager.getCacheStats();
    
    res.json({
      success: true,
      cacheStats: stats,
      cacheTimeout: analyticsManager.cacheTimeout / (60 * 60 * 1000) + '시간'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

app.post('/api/analytics-cache/clear', (req, res) => {
  try {
    analyticsManager.clearCache();
    
    res.json({
      success: true,
      message: 'YouTube Analytics 캐시가 모두 정리되었습니다.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 정리에 실패했습니다.',
      details: error.message
    });
  }
});

// Elasticsearch 연결 상태 확인 함수
async function checkESConnection() {
  if (!esClient) return false;
  try {
    await esClient.ping();
    return true;
  } catch (error) {
    console.warn('ES 연결 끊어짐:', error.message);
    esClient = null;
    return false;
  }
}

// 병렬 처리용 API 키 관리 시스템
class ApiKeyManager {
  constructor() {
    // 환경변수에서 여러 API 키 수집
    this.apiKeys = [];
    this.currentKeyIndex = 0; // 라운드 로빈용 인덱스
    this.keyUsageCount = {};
    this.keyQuotaExceeded = {};
    this.statusFile = path.join(__dirname, 'api_key_status.json');
    
    // API 키들을 환경변수에서 수집
    const maxKeys = parseInt(process.env.MAX_API_KEYS) || 10;
    console.log(`🔑 최대 API 키 개수: ${maxKeys}개 (병렬 처리 모드)`);
    
    for (let i = 1; i <= maxKeys; i++) {
      const key = process.env[`YOUTUBE_API_KEY_${i}`] || (i === 1 ? process.env.YOUTUBE_API_KEY : null);
      if (key && key !== 'your_primary_api_key_here' && key !== 'your_secondary_api_key_here' && key !== 'your_tertiary_api_key_here') {
        this.apiKeys.push({
          key: key,
          index: i,
          name: `API_KEY_${i}`,
          usageCount: 0,
          quotaExceeded: false,
          lastUsed: null,
          consecutiveErrors: 0  // 연속 오류 횟수 추가
        });
        this.keyUsageCount[i] = 0;
        this.keyQuotaExceeded[i] = false;
      }
    }
    
    if (this.apiKeys.length === 0) {
      console.error('❌ YouTube API 키가 설정되지 않았습니다!');
      console.log('📝 .env 파일에 다음과 같이 설정하세요:');
      console.log('YOUTUBE_API_KEY_1=your_first_api_key_here');
      console.log('YOUTUBE_API_KEY_2=your_second_api_key_here');
      console.log('YOUTUBE_API_KEY_3=your_third_api_key_here');
      process.exit(1);
    }
    
    console.log(`✅ ${this.apiKeys.length}개의 YouTube API 키가 병렬 처리용으로 설정되었습니다.`);
    this.apiKeys.forEach((keyInfo, index) => {
      console.log(`   ${index + 1}. ${keyInfo.name} (***${keyInfo.key.slice(-4)})`);
    });
    
    // 저장된 상태 로드
    this.loadKeyStatus();
  }
  
  // 라운드 로빈 방식으로 다음 키 선택
  getNextKeyRoundRobin() {
    const availableKeys = this.apiKeys.filter(keyInfo => 
      !keyInfo.quotaExceeded && keyInfo.consecutiveErrors < 3
    );
    
    if (availableKeys.length === 0) {
      console.log('⚠️ 모든 API 키의 할당량이 초과되었습니다.');
      return null;
    }
    
    // 라운드 로빈: 사용 가능한 키들 중에서 순차적으로 선택
    const keyIndex = this.currentKeyIndex % availableKeys.length;
    const selectedKey = availableKeys[keyIndex];
    
    // 다음 키로 인덱스 이동
    this.currentKeyIndex = (this.currentKeyIndex + 1) % availableKeys.length;
    
    console.log(`🔄 라운드 로빈 선택: ${selectedKey.name} (인덱스: ${keyIndex}/${availableKeys.length})`);
    return selectedKey;
  }
  
  // 현재 사용 가능한 API 키 반환 (기존 호환성 유지)
  getCurrentKey() {
    return this.getNextKeyRoundRobin();
  }
  
  // 현재 YouTube API 인스턴스 반환
  getYouTubeInstance() {
    const currentKey = this.getCurrentKey();
    if (!currentKey) {
      throw new Error('NO_AVAILABLE_KEYS: 사용 가능한 API 키가 없습니다.');
    }
    
    currentKey.usageCount++;
    currentKey.lastUsed = new Date();
    
    console.log(`🔑 병렬 처리용 키 사용: ${currentKey.name} (사용횟수: ${currentKey.usageCount})`);
    
    // 사용량 변경 저장 (주기적으로)
    if (currentKey.usageCount % 5 === 0) {
      this.saveKeyStatus();
    }
    
    const youtube = google.youtube({ version: 'v3', auth: currentKey.key });
    
    // YouTube 인스턴스와 키 정보를 함께 반환
    return {
      youtube: youtube,
      currentKey: currentKey
    };
  }
  
  // 할당량 초과 처리 - 개선된 로직
  markKeyAsQuotaExceeded(currentKey, errorMessage = '') {
    if (!currentKey) return null;
    
    console.log(`❌ ${currentKey.name} 오류 발생: ${errorMessage}`);
    
    // 할당량 관련 오류인지 확인
    if (errorMessage.includes('quota') || errorMessage.includes('quotaExceeded') || 
        errorMessage.includes('dailyLimitExceeded') || errorMessage.includes('rateLimitExceeded')) {
      currentKey.quotaExceeded = true;
      console.log(`🚫 ${currentKey.name} 할당량 초과로 비활성화됨`);
    } else {
      // 다른 오류의 경우 연속 오류 횟수 증가
      currentKey.consecutiveErrors++;
      console.log(`⚠️ ${currentKey.name} 연속 오류 횟수: ${currentKey.consecutiveErrors}`);
      
      // 연속 오류가 3회 이상이면 임시 비활성화
      if (currentKey.consecutiveErrors >= 3) {
        console.log(`🔒 ${currentKey.name} 연속 오류로 임시 비활성화 (할당량 초과는 아님)`);
      }
    }
    
    // 상태 변경 저장
    this.saveKeyStatus();
    
    // 다음 사용 가능한 키 찾기
    const nextKey = this.getCurrentKey();
    
    if (nextKey) {
      console.log(`🔄 ${nextKey.name}으로 전환합니다.`);
      return nextKey;
    } else {
      console.log('⚠️ 사용 가능한 API 키가 없습니다.');
      return null;
    }
  }
  
  // API 호출 성공 시 연속 오류 카운터 리셋
  markKeyAsSuccessful(currentKey) {
    if (currentKey && currentKey.consecutiveErrors > 0) {
      console.log(`✅ ${currentKey.name} 성공, 연속 오류 카운터 리셋`);
      currentKey.consecutiveErrors = 0;
      this.saveKeyStatus();
    }
  }
  
  // 사용 가능한 키가 있는지 확인
  hasAvailableKeys() {
    return this.apiKeys.some(keyInfo => !keyInfo.quotaExceeded);
  }
  
  // 할당량 초과 처리를 포함한 안전한 YouTube 인스턴스 반환
  async getYouTubeInstanceSafely() {
    const maxRetries = this.apiKeys.length;
    let currentRetry = 0;
    
    while (currentRetry < maxRetries) {
      const currentKey = this.getCurrentKey();
      
      if (!currentKey || currentKey.quotaExceeded) {
        console.log('사용 가능한 API 키가 없음');
        return null;
      }
      
      currentKey.usageCount++;
      currentKey.lastUsed = new Date();
      console.log(`🔑 사용 중인 API 키: ${currentKey.name} (사용횟수: ${currentKey.usageCount})`);
      
      const youtube = google.youtube({ version: 'v3', auth: currentKey.key });
      return { youtube, currentKey };
    }
    
    return null;
  }
  
  // 상태 파일에서 API 키 상태 로드
  loadKeyStatus() {
    try {
      if (fs.existsSync(this.statusFile)) {
        const status = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
        const today = new Date().toDateString();
        
        // 당일이 아니면 상태 리셋 (일일 할당량 갱신)
        if (status.date !== today) {
          console.log(`📅 날짜 변경 감지 (${status.date} → ${today}), API 키 상태 리셋`);
          this.resetDailyStatus();
        } else {
          console.log(`🔄 저장된 API 키 상태 로드 (${status.date})`);
          this.restoreKeyStatus(status);
        }
      } else {
        console.log(`📝 API 키 상태 파일이 없음, 새로 생성`);
        this.saveKeyStatus();
      }
    } catch (error) {
      console.error('⚠️ 상태 파일 로드 실패:', error.message);
      console.log('💡 기본 상태로 진행합니다.');
    }
  }
  
  // 저장된 상태를 API 키에 복원
  restoreKeyStatus(status) {
    status.keys.forEach(savedKey => {
      const apiKey = this.apiKeys.find(key => key.index === savedKey.index);
      if (apiKey) {
        apiKey.quotaExceeded = savedKey.quotaExceeded;
        apiKey.usageCount = savedKey.usageCount;
        apiKey.consecutiveErrors = savedKey.consecutiveErrors || 0;
        if (savedKey.lastUsed) {
          apiKey.lastUsed = new Date(savedKey.lastUsed);
        }
        
        // 레거시 추적 객체도 업데이트
        this.keyUsageCount[apiKey.index] = apiKey.usageCount;
        this.keyQuotaExceeded[apiKey.index] = apiKey.quotaExceeded;
      }
    });
    
    const exceededCount = this.apiKeys.filter(key => key.quotaExceeded).length;
    const availableCount = this.apiKeys.length - exceededCount;
    console.log(`📊 상태 복원 완료: ${availableCount}/${this.apiKeys.length} 키 사용 가능`);
  }
  
  // 일일 상태 리셋
  resetDailyStatus() {
    this.apiKeys.forEach(key => {
      key.quotaExceeded = false;
      key.consecutiveErrors = 0;
      // usageCount와 lastUsed는 유지 (통계 목적)
    });
    this.saveKeyStatus();
    console.log(`🔄 모든 API 키 상태가 리셋되었습니다.`);
  }
  
  // 현재 상태를 파일에 저장
  saveKeyStatus() {
    try {
      const status = {
        date: new Date().toDateString(),
        lastUpdated: new Date().toISOString(),
        keys: this.apiKeys.map(key => ({
          index: key.index,
          name: key.name,
          quotaExceeded: key.quotaExceeded,
          usageCount: key.usageCount,
          consecutiveErrors: key.consecutiveErrors,
          lastUsed: key.lastUsed ? key.lastUsed.toISOString() : null
        }))
      };
      
      fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 2), 'utf8');
      console.log(`💾 API 키 상태 저장 완료: ${this.statusFile}`);
    } catch (error) {
      console.error('⚠️ 상태 파일 저장 실패:', error.message);
    }
  }
  
  // 사용 통계 출력
  printUsageStats() {
    console.log('\n📊 API 키 사용 통계:');
    this.apiKeys.forEach(keyInfo => {
      const status = keyInfo.quotaExceeded ? '❌ 할당량 초과' : '✅ 사용 가능';
      const lastUsed = keyInfo.lastUsed ? keyInfo.lastUsed.toLocaleString() : '미사용';
      const currentIndicator = keyInfo.index === this.currentKeyIndex + 1 ? ' 🔑 현재' : '';
      const quotaInfo = keyInfo.quotaExceeded ? ' (할당량 초과)' : '';
      console.log(`   ${keyInfo.name}: ${status} | 사용횟수: ${keyInfo.usageCount} | 마지막 사용: ${lastUsed}${currentIndicator}${quotaInfo}`);
    });
    
    const availableKeys = this.apiKeys.filter(key => !key.quotaExceeded);
    const exhaustedKeys = this.apiKeys.filter(key => key.quotaExceeded);
    
    console.log(`\n📈 요약: ${availableKeys.length}/${this.apiKeys.length} 키 사용 가능`);
    if (exhaustedKeys.length > 0) {
      console.log(`   할당량 초과된 키: ${exhaustedKeys.map(k => k.name).join(', ')}`);
    }
    if (availableKeys.length > 0) {
      console.log(`   사용 가능한 키: ${availableKeys.map(k => k.name).join(', ')}`);
    }
    
    // 현재 활성 키 정보
    const currentKey = this.apiKeys[this.currentKeyIndex];
    if (currentKey) {
      console.log(`\n🔑 현재 활성 키: ${currentKey.name} (${currentKey.quotaExceeded ? '할당량 초과' : '정상'})`);
    }
  }
}

// API 키 매니저 인스턴스 생성
const apiKeyManager = new ApiKeyManager();

// YouTube Analytics API 수익 지표 관리 클래스
class YouTubeAnalyticsManager {
  constructor(apiKeyManager) {
    this.apiKeyManager = apiKeyManager;
    this.cache = new Map(); // 수익 데이터 캐시
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24시간 캐시
  }

  // YouTube Analytics API 인스턴스 가져오기
  getAnalyticsInstance() {
    const keyInfo = this.apiKeyManager.getCurrentKey();
    if (!keyInfo) {
      throw new Error('NO_AVAILABLE_KEYS: 사용 가능한 API 키가 없습니다.');
    }
    
    const youtubeAnalytics = google.youtubeAnalytics({
      version: 'v2',
      auth: keyInfo.key
    });
    
    return {
      analytics: youtubeAnalytics,
      currentKey: keyInfo
    };
  }

  // 채널의 수익 지표 가져오기
  async getRevenueMetrics(channelId, startDate, endDate) {
    try {
      // 캐시 확인
      const cacheKey = `${channelId}_${startDate}_${endDate}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log(`💾 캐시에서 수익 데이터 반환: ${channelId}`);
        return cached.data;
      }

      console.log(`📊 YouTube Analytics API 호출: ${channelId}`);
      
      // 수익 관련 지표 요청
      const { analytics, currentKey } = this.getAnalyticsInstance();
      
      // 주요 수익 지표들
      const metrics = [
        'estimatedRevenue',
        'estimatedAdRevenue', 
        'estimatedRedPartnerRevenue',
        'adImpressions',
        'playbackBasedCpm',
        'adCpm',
        'estimatedMinutesWatched',
        'views',
        'averageViewDuration',
        'subscribersGained'
      ].join(',');

      const response = await analytics.reports.query({
        ids: `channel==${channelId}`,
        startDate: startDate,
        endDate: endDate,
        metrics: metrics,
        dimensions: 'day',
        sort: 'day'
      });

      // 응답 데이터 처리
      const revenueData = this.processRevenueData(response.data);
      
      // 캐시에 저장
      this.cache.set(cacheKey, {
        data: revenueData,
        timestamp: Date.now()
      });

      console.log(`✅ 수익 데이터 조회 성공: ${channelId}`);
      return revenueData;

    } catch (error) {
      console.error(`❌ 수익 데이터 조회 실패 (${channelId}):`, error.message);
      
      // 권한 오류인 경우 (채널 소유자가 아님)
      if (error.message.includes('forbidden') || error.message.includes('unauthorized')) {
        return this.createEmptyRevenueData('권한 없음 - 채널 소유자만 수익 데이터 조회 가능');
      }
      
      // API 키 할당량 초과인 경우
      if (error.message.includes('quota')) {
        this.apiKeyManager.markKeyAsQuotaExceeded(this.apiKeyManager.getCurrentKey(), error.message);
        return this.createEmptyRevenueData('API 할당량 초과');
      }
      
      return this.createEmptyRevenueData('조회 실패');
    }
  }

  // 응답 데이터 처리
  processRevenueData(data) {
    if (!data || !data.rows || data.rows.length === 0) {
      return this.createEmptyRevenueData('데이터 없음');
    }

    // 최근 데이터 합산 (지난 30일)
    const totals = {
      estimatedRevenue: 0,
      estimatedAdRevenue: 0,
      estimatedRedPartnerRevenue: 0,
      adImpressions: 0,
      playbackBasedCpm: 0,
      adCpm: 0,
      estimatedMinutesWatched: 0,
      views: 0,
      averageViewDuration: 0,
      subscribersGained: 0
    };

    let validRows = 0;
    
    for (const row of data.rows) {
      if (row && row.length >= 10) {
        totals.estimatedRevenue += parseFloat(row[1]) || 0;
        totals.estimatedAdRevenue += parseFloat(row[2]) || 0;
        totals.estimatedRedPartnerRevenue += parseFloat(row[3]) || 0;
        totals.adImpressions += parseInt(row[4]) || 0;
        totals.playbackBasedCpm += parseFloat(row[5]) || 0;
        totals.adCpm += parseFloat(row[6]) || 0;
        totals.estimatedMinutesWatched += parseInt(row[7]) || 0;
        totals.views += parseInt(row[8]) || 0;
        totals.averageViewDuration += parseFloat(row[9]) || 0;
        totals.subscribersGained += parseInt(row[10]) || 0;
        validRows++;
      }
    }

    // 평균값 계산
    if (validRows > 0) {
      totals.playbackBasedCpm = totals.playbackBasedCpm / validRows;
      totals.adCpm = totals.adCpm / validRows;
      totals.averageViewDuration = totals.averageViewDuration / validRows;
    }

    return {
      ...totals,
      status: 'success',
      dataPoints: validRows,
      period: '30일간'
    };
  }

  // 빈 수익 데이터 생성
  createEmptyRevenueData(reason = '데이터 없음') {
    return {
      estimatedRevenue: 0,
      estimatedAdRevenue: 0,
      estimatedRedPartnerRevenue: 0,
      adImpressions: 0,
      playbackBasedCpm: 0,
      adCpm: 0,
      estimatedMinutesWatched: 0,
      views: 0,
      averageViewDuration: 0,
      subscribersGained: 0,
      status: 'no_data',
      reason: reason,
      dataPoints: 0,
      period: '30일간'
    };
  }

  // 캐시 정리
  clearCache() {
    this.cache.clear();
    console.log('🗑️ 수익 데이터 캐시 정리 완료');
  }

  // 캐시 통계
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if ((now - value.timestamp) < this.cacheTimeout) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }
    
    return {
      total: this.cache.size,
      valid: validEntries,
      expired: expiredEntries
    };
  }
}

// YouTube Analytics 매니저 인스턴스 생성
const analyticsManager = new YouTubeAnalyticsManager(apiKeyManager);

// Elasticsearch 헬퍼 함수들
class ElasticsearchHelper {
  constructor(client) {
    this.client = client;
    this.indexName = process.env.ES_INDEX_VIDEOS || 'videos';
    this.ttlHours = parseInt(process.env.ES_TTL_HOURS) || 48;
  }

  // 캐시 히트 판단
  async checkCacheHit(searchParams) {
    if (!this.client || !(await checkESConnection())) return { hit: false, reason: 'ES client not available' };
    
    try {
      const { country, keyword, minViews, maxViews, maxResults, publishedAfter, publishedBefore } = searchParams;
      
      // 검색 조건 구성
      const mustQueries = [];
      const filterQueries = [];
      
      if (country && country !== 'worldwide') {
        mustQueries.push({ term: { country } });
      }
      
      if (keyword && keyword.trim()) {
        mustQueries.push({ term: { keyword_normalized: keyword.toLowerCase() } });
      }
      
      if (minViews) {
        filterQueries.push({ range: { daily_view_count: { gte: parseInt(minViews) } } });
      }
      
      if (maxViews) {
        filterQueries.push({ range: { daily_view_count: { lte: parseInt(maxViews) } } });
      }
      
      // 업로드 날짜 범위 필터링 추가
      if (publishedAfter || publishedBefore) {
        const dateRange = {};
        if (publishedAfter) dateRange.gte = publishedAfter;
        if (publishedBefore) dateRange.lte = publishedBefore;
        filterQueries.push({ range: { status_date: dateRange } });
        console.log('ES 날짜 범위 필터 적용:', dateRange);
      }
      
      const searchQuery = {
        query: {
          bool: {
            must: mustQueries,
            filter: filterQueries
          }
        },
        sort: [{ daily_view_count: 'desc' }],
        size: parseInt(maxResults) || 60
      };
      
      const response = await this.client.search({
        index: this.indexName,
        body: searchQuery
      });
      
      // ES 결과를 API 응답 형식으로 변환
      const results = response.body.hits.hits.map(hit => ({
        youtube_channel_name: hit._source.youtube_channel_name,
        thumbnail_url: hit._source.thumbnail_url,
        status: hit._source.status || 'active',
        youtube_channel_id: hit._source.youtube_channel_id,
        primary_category: hit._source.primary_category,
        status_date: hit._source.status_date,
        daily_view_count: hit._source.daily_view_count,
        subscriber_count: hit._source.subscriber_count,
        vod_url: hit._source.vod_url,
        video_id: hit._source.video_id,
        title: hit._source.title,
        description: hit._source.description,
        duration: hit._source.duration,
        duration_seconds: hit._source.duration_seconds,
        video_length_category: hit._source.video_length_category
      }));
      
      return results;
      
    } catch (error) {
      console.error('ES search error:', error);
      return null;
    }
  }
  
  // YouTube API 결과를 ES에 bulk upsert
  async bulkUpsertVideos(videos, searchParams) {
    if (!this.client || !videos || videos.length === 0 || !(await checkESConnection())) return;
    
    try {
      const body = [];
      const indexedAt = new Date().toISOString();
      
      videos.forEach(video => {
        // upsert를 위한 update 액션
        body.push({
          update: {
            _index: this.indexName,
            _id: video.video_id
          }
        });
        
        // 문서 내용
        body.push({
          doc: {
            video_id: video.video_id,
            title: video.title,
            youtube_channel_name: video.youtube_channel_name,
            youtube_channel_id: video.youtube_channel_id,
            country: searchParams.country || 'unknown',
            status_date: video.status_date,
            daily_view_count: parseInt(video.daily_view_count) || 0,
            subscriber_count: parseInt(video.subscriber_count) || 0,
            duration_seconds: parseInt(video.duration_seconds) || 0,
            video_length_category: video.video_length_category,
            primary_category: video.primary_category,
            vod_url: video.vod_url,
            thumbnail_url: video.thumbnail_url,
            status: video.status || 'active',
            description: video.description || '',
            duration: video.duration || '',
            keyword_normalized: (searchParams.keyword || '').toLowerCase(),
            indexed_at: indexedAt
          },
          doc_as_upsert: true
        });
      });
      
      const response = await this.client.bulk({ body });
        
      // 응답 구조 검증 및 안전한 오류 처리
      if (response && response.body && response.body.errors) {
        console.error('ES bulk upsert errors:', response.body.items.filter(item => item.update && item.update.error));
      } else if (response && response.errors) {
        // 새로운 버전의 클라이언트 응답 구조
        console.error('ES bulk upsert errors:', response.items.filter(item => item.update && item.update.error));
      } else {
        console.log(`ES bulk upsert 성공: ${videos.length}개 비디오 인덱싱`);
      }
      
    } catch (error) {
      console.error('ES bulk upsert error:', error);
    }
  }
}

// ES 헬퍼 인스턴스 생성
const esHelper = new ElasticsearchHelper(esClient);

// 간단한 Rate Limiting 구현
const requestTracker = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15분
const RATE_LIMIT_MAX_REQUESTS = 10; // 15분당 최대 10회 검색

function rateLimitMiddleware(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // 이전 요청 기록 가져오기
  let requests = requestTracker.get(clientIP) || [];
  
  // 오래된 요청 제거 (15분 이전)
  requests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  // 제한 초과 확인
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: '검색 요청이 너무 많습니다. 15분 후에 다시 시도해주세요.',
      retryAfter: Math.ceil((requests[0] + RATE_LIMIT_WINDOW - now) / 1000)
    });
  }
  
  // 현재 요청 추가
  requests.push(now);
  requestTracker.set(clientIP, requests);
  
  next();
}

// 주기적으로 오래된 데이터 정리
setInterval(() => {
  const now = Date.now();
  for (const [ip, requests] of requestTracker.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    if (validRequests.length === 0) {
      requestTracker.delete(ip);
    } else {
      requestTracker.set(ip, validRequests);
    }
  }
}, 5 * 60 * 1000); // 5분마다 정리

// 메인 페이지 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'you_list.html'));
});

// YouTube Analytics 캐시 관리 API
app.get('/api/analytics-cache/stats', (req, res) => {
  try {
    const stats = analyticsManager.getCacheStats();
    
    res.json({
      success: true,
      cacheStats: stats,
      cacheTimeout: analyticsManager.cacheTimeout / (60 * 60 * 1000) + '시간'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

app.post('/api/analytics-cache/clear', (req, res) => {
  try {
    analyticsManager.clearCache();
    
    res.json({
      success: true,
      message: 'YouTube Analytics 캐시가 모두 정리되었습니다.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 정리에 실패했습니다.',
      details: error.message
    });
  }
});
      
      if (country && country !== 'worldwide') {
        mustQueries.push({ term: { country } });
      }
      
      if (keyword && keyword.trim()) {
        mustQueries.push({ term: { keyword_normalized: keyword.toLowerCase() } });
      }
      
      if (minViews) {
        filterQueries.push({ range: { daily_view_count: { gte: parseInt(minViews) } } });
      }
      
      if (maxViews) {
        filterQueries.push({ range: { daily_view_count: { lte: parseInt(maxViews) } } });
      }
      
      // 업로드 날짜 범위 필터링 추가
      if (publishedAfter || publishedBefore) {
        const dateRange = {};
        if (publishedAfter) dateRange.gte = publishedAfter;
        if (publishedBefore) dateRange.lte = publishedBefore;
        filterQueries.push({ range: { status_date: dateRange } });
        console.log('ES 날짜 범위 필터 적용:', dateRange);
        console.log('ES 캐시 체크 날짜 범위 필터 적용:', dateRange);
      }
      
      // 캐시된 데이터 수량 확인
      const countQuery = {
        query: {
          bool: {
            must: mustQueries,
            filter: filterQueries
          }
        }
      };
      
      const countResponse = await this.client.count({
        index: this.indexName,
        body: countQuery
      });
      
      const availableCount = countResponse.body?.count || countResponse.count || 0;
      const requestedCount = parseInt(maxResults) || 60;
      
      // 신선도 확인
      const freshnessQuery = {
        query: { bool: { must: mustQueries, filter: filterQueries } },
        sort: [{ indexed_at: 'desc' }],
        size: 1,
        _source: ['indexed_at']
      };
      
      const freshnessResponse = await this.client.search({
        index: this.indexName,
        body: freshnessQuery
      });
      
      const hits = freshnessResponse.body?.hits?.hits || freshnessResponse.hits?.hits || [];
      let isFresh = false;
      
      if (hits.length > 0) {
        const lastIndexed = new Date(hits[0]._source.indexed_at);
        const ttlLimit = new Date(Date.now() - this.ttlHours * 60 * 60 * 1000);
        isFresh = lastIndexed > ttlLimit;
      }
      
      const cacheHit = availableCount >= requestedCount && isFresh;
      
      return {
        hit: cacheHit,
        availableCount,
        requestedCount,
        isFresh,
        reason: cacheHit ? 'Cache hit' : `Insufficient data (${availableCount}/${requestedCount}) or stale data (fresh: ${isFresh})`
      };
      
    } catch (error) {
      console.error('Cache hit check error:', error);
      return { hit: false, reason: 'Cache check failed', error: error.message };
    }
  }
  
  // ES에서 검색 결과 조회
  async searchVideos(searchParams) {
    if (!this.client || !(await checkESConnection())) return null;
    
    try {
      const { country, keyword, minViews, maxViews, maxResults, publishedAfter, publishedBefore } = searchParams;
      
      // 검색 조건 구성
      const mustQueries = [];
      const filterQueries = [];
      
      if (country && country !== 'worldwide') {
        mustQueries.push({ term: { country } });
      }
      
      if (keyword && keyword.trim()) {
        mustQueries.push({ term: { keyword_normalized: keyword.toLowerCase() } });
      }
      
      if (minViews) {
        filterQueries.push({ range: { daily_view_count: { gte: parseInt(minViews) } } });
      }
      
      if (maxViews) {
        filterQueries.push({ range: { daily_view_count: { lte: parseInt(maxViews) } } });
      }
      
      // 업로드 날짜 범위 필터링 추가
      if (publishedAfter || publishedBefore) {
        const dateRange = {};
        if (publishedAfter) dateRange.gte = publishedAfter;
        if (publishedBefore) dateRange.lte = publishedBefore;
        filterQueries.push({ range: { status_date: dateRange } });
        console.log('ES 날짜 범위 필터 적용:', dateRange);
      }
      
      const searchQuery = {
        query: {
          bool: {
            must: mustQueries,
            filter: filterQueries
          }
        },
        sort: [{ daily_view_count: 'desc' }],
        size: parseInt(maxResults) || 60
      };
      
      const response = await this.client.search({
        index: this.indexName,
        body: searchQuery
      });
      
      // ES 결과를 API 응답 형식으로 convertToApiResponse
      const results = response.body.hits.hits.map(hit => ({
        youtube_channel_name: hit._source.youtube_channel_name,
        thumbnail_url: hit._source.thumbnail_url,
        status: hit._source.status || 'active',
        youtube_channel_id: hit._source.youtube_channel_id,
        primary_category: hit._source.primary_category,
        status_date: hit._source.status_date,
        daily_view_count: hit._source.daily_view_count,
        subscriber_count: hit._source.subscriber_count,
        vod_url: hit._source.vod_url,
        video_id: hit._source.video_id,
        title: hit._source.title,
        description: hit._source.description,
        duration: hit._source.duration,
        duration_seconds: hit._source.duration_seconds,
        video_length_category: hit._source.video_length_category
      }));
      
      return results;
      
    } catch (error) {
      console.error('ES search error:', error);
      return null;
    }
  }
  
  // YouTube API 결과를 ES에 bulk upsert
  async bulkUpsertVideos(videos, searchParams) {
    if (!this.client || !videos || videos.length === 0 || !(await checkESConnection())) return;
    
    try {
      const body = [];
      const indexedAt = new Date().toISOString();
      
      videos.forEach(video => {
        // upsert를 위한 update 액션
        body.push({
          update: {
            _index: this.indexName,
            _id: video.video_id
          }
        });
        
        // 문서 내용
        body.push({
          doc: {
            video_id: video.video_id,
            title: video.title,
            youtube_channel_name: video.youtube_channel_name,
            youtube_channel_id: video.youtube_channel_id,
            country: searchParams.country || 'unknown',
            status_date: video.status_date,
            daily_view_count: parseInt(video.daily_view_count) || 0,
            subscriber_count: parseInt(video.subscriber_count) || 0,
            duration_seconds: parseInt(video.duration_seconds) || 0,
            video_length_category: video.video_length_category,
            primary_category: video.primary_category,
            vod_url: video.vod_url,
            thumbnail_url: video.thumbnail_url,
            status: video.status || 'active',
            description: video.description || '',
            duration: video.duration || '',
            keyword_normalized: (searchParams.keyword || '').toLowerCase(),
            indexed_at: indexedAt
          },
          doc_as_upsert: true
        });
      });
      
      const response = await this.client.bulk({ body });
        
        // 응답 구조 검증 및 안전한 오류 처리
        if (response && response.body && response.body.errors) {
          console.error('ES bulk upsert errors:', response.body.items.filter(item => item.update && item.update.error));
        } else if (response && response.errors) {
          // 새로운 버전의 클라이언트 응답 구조
          console.error('ES bulk upsert errors:', response.items.filter(item => item.update && item.update.error));
        } else {
          console.log(`ES bulk upsert 성공: ${videos.length}개 비디오 인덱싱`);
        }
      
    } catch (error) {
      console.error('ES bulk upsert error:', error);
    }
  }
}

// ES 헬퍼 인스턴스 생성
const esHelper = new ElasticsearchHelper(esClient);

// 간단한 Rate Limiting 구현
const requestTracker = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15분
const RATE_LIMIT_MAX_REQUESTS = 10; // 15분당 최대 10회 검색

function rateLimitMiddleware(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // 이전 요청 기록 가져오기
  let requests = requestTracker.get(clientIP) || [];
  
  // 오래된 요청 제거 (15분 이전)
  requests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  // 제한 초과 확인
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: '검색 요청이 너무 많습니다. 15분 후에 다시 시도해주세요.',
      retryAfter: Math.ceil((requests[0] + RATE_LIMIT_WINDOW - now) / 1000)
    });
  }
  
  // 현재 요청 추가
  requests.push(now);
  requestTracker.set(clientIP, requests);
  
  next();
}

// 주기적으로 오래된 데이터 정리
setInterval(() => {
  const now = Date.now();
  for (const [ip, requests] of requestTracker.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    if (validRequests.length === 0) {
      requestTracker.delete(ip);
    } else {
      requestTracker.set(ip, validRequests);
    }
  }
}, 5 * 60 * 1000); // 5분마다 정리

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
// 대용량 데이터 처리를 위한 body-parser 제한 증가
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// 메인 페이지 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'you_list.html'));
});

// YouTube Analytics 캐시 관리 API
app.get('/api/analytics-cache/stats', (req, res) => {
  try {
    const stats = analyticsManager.getCacheStats();
    
    res.json({
      success: true,
      cacheStats: stats,
      cacheTimeout: analyticsManager.cacheTimeout / (60 * 60 * 1000) + '시간'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

app.post('/api/analytics-cache/clear', (req, res) => {
  try {
    analyticsManager.clearCache();
    
    res.json({
      success: true,
      message: 'YouTube Analytics 캐시가 모두 정리되었습니다.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '캐시 정리에 실패했습니다.',
      details: error.message
    });
  }
});으로 변환
      const results = response.body.hits.hits.map(hit => ({
        youtube_channel_name: hit._source.youtube_channel_name,
        thumbnail_url: hit._source.thumbnail_url,
        status: hit._source.status || 'active',
        youtube_channel_id: hit._source.youtube_channel_id,
        primary_category: hit._source.primary_category,
        status_date: hit._source.status_date,
        daily_view_count: hit._source.daily_view_count,
        subscriber_count: hit._source.subscriber_count,
        vod_url: hit._source.vod_url,
        video_id: hit._source.video_id,
        title: hit._source.title,
        description: hit._source.description,
        duration: hit._source.duration,
        duration_seconds: hit._source.duration_seconds,
        video_length_category: hit._source.video_length_category
      }));
      
      return results;
      
    } catch (error) {
      console.error('ES search error:', error);
      return null;
    }
  }
  
  // YouTube API 결과를 ES에 bulk upsert
  async bulkUpsertVideos(videos, searchParams) {
    if (!this.client || !videos || videos.length === 0 || !(await checkESConnection())) return;
    
    try {
      const body = [];
      const indexedAt = new Date().toISOString();
      
      videos.forEach(video => {
        // upsert를 위한 update 액션
        body.push({
          update: {
            _index: this.indexName,
            _id: video.video_id
          }
        });
        
        // 문서 내용
        body.push({
          doc: {
            video_id: video.video_id,
            title: video.title,
            youtube_channel_name: video.youtube_channel_name,
            youtube_channel_id: video.youtube_channel_id,
            country: searchParams.country || 'unknown',
            status_date: video.status_date,
            daily_view_count: parseInt(video.daily_view_count) || 0,
            subscriber_count: parseInt(video.subscriber_count) || 0,
            duration_seconds: parseInt(video.duration_seconds) || 0,
            video_length_category: video.video_length_category,
            primary_category: video.primary_category,
            vod_url: video.vod_url,
            thumbnail_url: video.thumbnail_url,
            status: video.status || 'active',
            description: video.description || '',
            duration: video.duration || '',
            keyword_normalized: (searchParams.keyword || '').toLowerCase(),
            indexed_at: indexedAt
          },
          doc_as_upsert: true
        });
      });
      
              const response = await this.client.bulk({ body });
        
        // 응답 구조 검증 및 안전한 오류 처리
        if (response && response.body && response.body.errors) {
          console.error('ES bulk upsert errors:', response.body.items.filter(item => item.update && item.update.error));
        } else if (response && response.errors) {
          // 새로운 버전의 클라이언트 응답 구조
          console.error('ES bulk upsert errors:', response.items.filter(item => item.update && item.update.error));
        } else {
          console.log(`ES bulk upsert 성공: ${videos.length}개 비디오 인덱싱`);
        }
      
    } catch (error) {
      console.error('ES bulk upsert error:', error);
    }
  }
}

// ES 헬퍼 인스턴스 생성
const esHelper = new ElasticsearchHelper(esClient);

// 간단한 Rate Limiting 구현
const requestTracker = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15분
const RATE_LIMIT_MAX_REQUESTS = 10; // 15분당 최대 10회 검색

function rateLimitMiddleware(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // 이전 요청 기록 가져오기
  let requests = requestTracker.get(clientIP) || [];
  
  // 오래된 요청 제거 (15분 이전)
  requests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  // 제한 초과 확인
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: '검색 요청이 너무 많습니다. 15분 후에 다시 시도해주세요.',
      retryAfter: Math.ceil((requests[0] + RATE_LIMIT_WINDOW - now) / 1000)
    });
  }
  
  // 현재 요청 추가
  requests.push(now);
  requestTracker.set(clientIP, requests);
  
  next();
}

// 주기적으로 오래된 데이터 정리
setInterval(() => {
  const now = Date.now();
  for (const [ip, requests] of requestTracker.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    if (validRequests.length === 0) {
      requestTracker.delete(ip);
    } else {
      requestTracker.set(ip, validRequests);
    }
  }
}, 5 * 60 * 1000); // 5분마다 정리

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
// 대용량 데이터 처리를 위한 body-parser 제한 증가
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// 메인 페이지 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'you_list.html'));
});

// YouTube 동영상 검색 API
app.get('/api/search', rateLimitMiddleware, async (req, res) => {
  const searchStartTime = Date.now(); // 검색 시작 시간 기록
  
  try {
    const {
      country = 'worldwide',  // 기본값을 전세계로 변경
      countries = '',         // 다중 국가 선택 파라미터 추가
      keyword = '',
      searchScope = 'title',  // 검색 범위: title, channel, 또는 분리된 문자열
      maxViews,
      minViews = 100000,
      uploadPeriod,
      startDate,
      endDate,
      videoLength,
      maxResults = 60,   // 기본값 60건
      categories = ''   // 카테고리 필터
    } = req.query;

    // maxResults 유효성 검사 및 변환
    const allowedResults = [10, 20, 30, 40, 50, 60, 100, 150, 200];
    const parsedMaxResults = parseInt(maxResults);
    const finalMaxResults = allowedResults.includes(parsedMaxResults) ? parsedMaxResults : 60;

    console.log('검색 파라미터:', req.query);
    console.log('선택된 국가(단수):', country);
    console.log('선택된 국가들(복수):', countries);
    
    // 다중 국가 처리 로직 개선
    let selectedCountries;
    if (countries && countries.length > 0) {
      // countries 파라미터가 있으면 우선 사용
      if (Array.isArray(countries)) {
        selectedCountries = countries.filter(c => c && c.trim());
      } else if (typeof countries === 'string') {
        selectedCountries = countries.split(',').filter(c => c.trim());
      } else {
        selectedCountries = [country];
      }
    } else {
      // countries가 없으면 country 사용
      selectedCountries = [country];
    }
    
    // 중복 제거 및 유효성 검사
    selectedCountries = [...new Set(selectedCountries.filter(c => c && c.trim()))];
    if (selectedCountries.length === 0) {
      selectedCountries = ['worldwide'];
    }
    
    console.log('최종 처리할 국가 목록:', selectedCountries);
    
    console.log('검색 범위:', searchScope);
    console.log('선택된 카테고리:', categories);
    console.log(`검색 결과 수: ${finalMaxResults}건 (요청: ${maxResults})`);

    // 동영상 길이 파라미터 파싱
    const selectedVideoLengths = videoLength && videoLength.trim() ? videoLength.split(',').filter(v => v.trim()) : [];
    console.log('선택된 동영상 길이:', selectedVideoLengths.length > 0 ? selectedVideoLengths : '모든 길이 허용 (필터 없음)');

    // 다중 국가 처리: 첫 번째 국가를 기준으로 설정 (향후 확장 가능)
    const primaryCountry = selectedCountries[0];
    console.log(`🎯 주 검색 국가: ${primaryCountry} (총 ${selectedCountries.length}개국 선택됨)`);

    // ========== Elasticsearch 캐시 우선 로직 시작 ==========
    const searchParameters = {
      country: primaryCountry,        // 주 검색 국가
      countries: selectedCountries.join(','), // 선택된 모든 국가 목록
      keyword,
      searchScope,
      categories,
      minViews,
      maxViews,
      uploadPeriod,
      startDate,
      endDate,
      videoLength,
      maxResults: finalMaxResults,
      // 날짜 범위 정보 추가
      publishedAfter: null,
      publishedBefore: null
    };
    
    // 날짜 범위 정보 추가 (Elasticsearch 캐시 비교용)
    if (uploadPeriod) {
      const dateRange = getDateRange(uploadPeriod);
      searchParameters.publishedAfter = dateRange.publishedAfter;
      searchParameters.publishedBefore = dateRange.publishedBefore;
    } else if (startDate || endDate) {
      if (startDate) {
        try {
          const startDateTime = new Date(startDate + 'T00:00:00.000Z');
          searchParameters.publishedAfter = startDateTime.toISOString();
        } catch (e) {
          console.warn('시작일 파싱 오류:', e.message);
        }
      }
      if (endDate) {
        try {
          const endDateTime = new Date(endDate + 'T23:59:59.999Z');
          searchParameters.publishedBefore = endDateTime.toISOString();
        } catch (e) {
          console.warn('종료일 파싱 오류:', e.message);
        }
      }
    }
    
    // 1단계: 캐시 히트 확인
    console.log('🔍 Elasticsearch 캐시 확인 중...');
    const cacheResult = await esHelper.checkCacheHit(searchParameters);
    console.log('📊 캐시 확인 결과:', cacheResult);
    
    if (cacheResult.hit) {
      // 캐시 히트: ES에서 결과 조회
      console.log('✅ 캐시 히트! Elasticsearch에서 결과 조회');
      const cachedResults = await esHelper.searchVideos(searchParameters);
      
      if (cachedResults && cachedResults.length > 0) {
        console.log(`📦 캐시에서 ${cachedResults.length}개 결과 반환`);
        
        // 캐시 검색 소요시간 계산
        const cacheEndTime = Date.now();
        const cacheDuration = cacheEndTime - searchStartTime;
        const cacheDurationSeconds = (cacheDuration / 1000).toFixed(2);
        
        console.log(`\n⏱️ 캐시 검색 완료: 총 소요시간 ${cacheDurationSeconds}초 (${cachedResults.length}개 결과)`);
        console.log(`🔍 검색 조건: ${country}/${keyword || '키워드 없음'}/${finalMaxResults}건`);
        console.log('⚡ 캐시 히트로 초고속 검색!');
        console.log('='.repeat(52));
        
        return res.json({
          success: true,
          data: cachedResults,
          total: cachedResults.length,
          source: 'elasticsearch_cache',
          searchDuration: `${cacheDurationSeconds}초`
        });
      } else {
        console.log('⚠️ 캐시 히트였지만 결과가 없음, YouTube API로 fallback');
      }
    } else {
      console.log('❌ 캐시 미스:', cacheResult.reason);
      console.log('🔄 YouTube API 호출로 진행');
    }
    // ========== Elasticsearch 캐시 우선 로직 끝 ==========

    let searchResults = [];
    let nextPageToken = '';
    const resultsPerPage = Math.min(finalMaxResults, 50); // 선택한 결과 수에 따라 페이지당 요청량 조정

    // YouTube API 검색 파라미터 설정
    let searchParams = {
      part: 'snippet',
      type: 'video',
      maxResults: resultsPerPage,
      order: 'viewCount'
    };

    // primaryCountry는 이미 위에서 선언되었으므로 사용만 하기
    
    // 국가별 지역 코드 설정 (전세계가 아닌 경우에만)
    if (primaryCountry !== 'worldwide') {
      const regionCode = getCountryCode(primaryCountry);
      if (regionCode) {
        searchParams.regionCode = regionCode;
        console.log(`✅ 지역 코드 설정: ${primaryCountry} → ${regionCode}`);
      } else {
        console.log(`⚠️ 경고: '${primaryCountry}' 국가의 regionCode를 찾을 수 없어 전세계 검색으로 진행합니다.`);
      }
    } else {
      console.log('🌍 전세계 검색: regionCode 없이 진행');
    }

    // 언어 설정 (주 검색 국가의 기본 언어)
    const languageCode = getLanguageCode(primaryCountry);
    if (languageCode) {
      searchParams.relevanceLanguage = languageCode;
      console.log(`🌐 언어 설정: ${primaryCountry} → ${languageCode}`);
    }

    // 키워드 설정 (검색 범위 포함)
    const isEmptyKeyword = !keyword || !keyword.trim();
    
    if (!isEmptyKeyword) {
      // 검색 범위에 따른 쿼리 구성 (타입 안전성 확보)
      let searchScopes = ['title']; // 기본값
      
      if (searchScope) {
        if (typeof searchScope === 'string') {
          searchScopes = searchScope.split(',').map(s => s.trim()).filter(s => s);
        } else if (Array.isArray(searchScope)) {
          searchScopes = searchScope.map(s => String(s).trim()).filter(s => s);
        } else {
          console.log('검색 범위 타입 오류, 기본값 사용:', typeof searchScope, searchScope);
        }
      }
      
      let searchQuery = keyword.trim();
      
      // YouTube API에서 태그 검색을 위한 특별 처리
      if (searchScopes.includes('tags')) {
        // 태그 검색을 위해 hashtag나 특정 형식 사용
        searchQuery = `${searchQuery} tags`;
        console.log(`태그 포함 검색: "${searchQuery}"`);
      }
      
      // 채널명 검색이 포함된 경우
      if (searchScopes.includes('channel')) {
        searchQuery = `${searchQuery} channel`;
        console.log(`채널명 포함 검색: "${searchQuery}"`);
      }
      
      searchParams.q = searchQuery;
      console.log(`키워드 검색 (범위: ${searchScopes.join(', ')}): "${searchQuery}"`);
    } else {
      // 키워드가 없을 때는 국가별 인기 동영상 검색
      console.log('키워드 없음: 국가별 인기 동영상 검색');
      
      if (country !== 'worldwide') {
        // 특정 국가 선택 시: 해당 국가의 인기 콘텐츠 검색
        console.log(`🏳️ ${country} 국가의 인기 동영상 검색`);
        
        // 국가별 인기 검색어 사용 (더 정확한 지역별 결과)
        const countrySpecificTerms = {
          'korea': ['한국', 'korean', 'korea', '한국어'],
          'usa': ['america', 'usa', 'american', 'english'],
          'japan': ['japan', 'japanese', '일본', '일본어'],
          'uk': ['britain', 'uk', 'british', 'english'],
          'germany': ['germany', 'german', 'deutsch', '독일'],
          'france': ['france', 'french', 'français', '프랑스'],
          'canada': ['canada', 'canadian', 'english', 'french'],
          'australia': ['australia', 'australian', 'english'],
          'india': ['india', 'indian', 'hindi', 'english'],
          'brazil': ['brazil', 'brazilian', 'portuguese', 'português'],
          'mexico': ['mexico', 'mexican', 'spanish', 'español'],
          'italy': ['italy', 'italian', 'italiano', '이탈리아'],
          'spain': ['spain', 'spanish', 'español', '스페인']
        };
        
        const terms = countrySpecificTerms[country] || ['video', 'popular'];
        const randomTerm = terms[Math.floor(Math.random() * terms.length)];
        searchParams.q = randomTerm;
        
        // 국가별 검색을 위해 order를 relevance로 설정 (regionCode와 relevanceLanguage가 우선 적용됨)
        searchParams.order = 'relevance';
        
        console.log(`🌍 ${country} 국가별 인기 검색어: "${randomTerm}"`);
        console.log('설정: 관련성 순서로 정렬 (국가별 우선)');
      } else {
        // 전세계 선택 시: 일반적인 인기 동영상 검색
        console.log('🌍 전세계 인기 동영상 검색');
        
        const broadSearchTerms = ['a', 'the', 'and', 'or', 'video', 'youtube'];
        const randomTerm = broadSearchTerms[Math.floor(Math.random() * broadSearchTerms.length)];
        searchParams.q = randomTerm;
        
        // 전세계 검색 시에만 조회수 순 정렬
        searchParams.order = 'viewCount';
        
        console.log(`전세계 인기 동영상 검색어: "${randomTerm}"`);
        console.log('설정: 조회수 높은 순서로 정렬');
      }
    }

    // 디버그 로그 출력 (키워드 설정 후)
    console.log('=== 국가별 검색 디버그 정보 ===');
    console.log('1. 클라이언트 요청 country:', country);
    console.log('2. getCountryCode 결과:', getCountryCode(country));
    console.log('3. getLanguageCode 결과:', getLanguageCode(country));
    console.log('4. 키워드 상태:', keyword ? `"${keyword}"` : '없음 (국가별 인기 검색)');
    console.log('5. 검색 전략:', keyword ? '키워드 기반 검색' : (country === 'worldwide' ? '전세계 인기 검색' : `${country} 국가별 인기 검색`));
    console.log('6. 최종 YouTube API 검색 파라미터:', {
      regionCode: searchParams.regionCode || '없음 (전세계 검색)',
      relevanceLanguage: searchParams.relevanceLanguage,
      country: country,
      keyword: searchParams.q || '키워드 없음',
      order: searchParams.order,
      type: searchParams.type,
      isWorldwide: country === 'worldwide'
    });
    console.log('7. 검색 타입:', country === 'worldwide' ? '🌍 전세계 검색' : `🏳️ ${country} 국가별 검색`);
    console.log('========================================');

    // 업로드 기간 설정 (기존 드롭다운 방식)
    if (uploadPeriod) {
      const { publishedAfter, publishedBefore } = getDateRange(uploadPeriod);
      if (publishedAfter) searchParams.publishedAfter = publishedAfter;
      if (publishedBefore) searchParams.publishedBefore = publishedBefore;
    }

    // 커스텀 날짜 범위 설정 (startDate, endDate가 있으면 uploadPeriod보다 우선)
    if (startDate || endDate) {
      if (startDate) {
        try {
          const startDateTime = new Date(startDate + 'T00:00:00.000Z'); // UTC 기준으로 명시적 처리
          if (isNaN(startDateTime.getTime())) {
            throw new Error('Invalid start date');
          }
          searchParams.publishedAfter = startDateTime.toISOString();
          console.log('✅ 시작일 설정 성공 (UTC):', startDateTime.toISOString());
        } catch (error) {
          console.error('❌ 시작일 처리 오류:', error.message, '입력값:', startDate);
          // 오류 시 시작일 무시하고 계속 진행
        }
      }
      if (endDate) {
        try {
          const endDateTime = new Date(endDate + 'T23:59:59.999Z'); // UTC 기준으로 명시적 처리
          if (isNaN(endDateTime.getTime())) {
            throw new Error('Invalid end date');
          }
          searchParams.publishedBefore = endDateTime.toISOString();
          console.log('✅ 종료일 설정 성공 (UTC):', endDateTime.toISOString());
        } catch (error) {
          console.error('❌ 종료일 처리 오류:', error.message, '입력값:', endDate);
          // 오류 시 종료일 무시하고 계속 진행
        }
      }
      console.log('📅 커스텀 날짜 범위 적용:', {
        startDate: startDate || '없음',
        endDate: endDate || '없음',
        publishedAfter: searchParams.publishedAfter || '없음',
        publishedBefore: searchParams.publishedBefore || '없음'
      });
    }

    // 동영상 길이 설정 (YouTube API는 'short', 'medium', 'long'만 지원하므로 후처리에서 필터링)
    // videoLength 파라미터는 클라이언트에서 받아서 결과 필터링에 사용

         // 선택한 수만큼 결과 수집 (중복 제거)
     const processedVideoIds = new Set(); // 이미 처리된 비디오 ID 추적
     const processedChannelTitles = new Set(); // 이미 처리된 채널명 추적 (선택적)
     
     while (searchResults.length < finalMaxResults) {
       if (nextPageToken) {
         searchParams.pageToken = nextPageToken;
       }

       let response;
       let currentApiKey = apiKeyManager.getCurrentKey();
       
       // 견고한 API 키 전환 로직으로 재작성
       let retryCount = 0;
       const maxRetries = apiKeyManager.apiKeys.length;
       
       while (retryCount < maxRetries) {
                 try {
          const youtubeInstance = apiKeyManager.getYouTubeInstance();
          currentApiKey = youtubeInstance.currentKey;
          response = await youtubeInstance.youtube.search.list(searchParams);
          break; // 성공하면 루프 종료
        } catch (apiError) {
          console.error(`YouTube API 오류 (${currentApiKey.name}):`, apiError.message);
           
           // 할당량 초과 오류인 경우 다음 키로 전환
           if (apiError.message.includes('quota') || apiError.message.includes('quotaExceeded')) {
             console.log(`🚫 ${currentApiKey.name} 할당량 초과 감지`);
             
             const newApiKey = apiKeyManager.markKeyAsQuotaExceeded(currentApiKey);
             if (newApiKey) {
               console.log(`🔄 ${newApiKey.name}로 재시도합니다... (재시도 ${retryCount + 1}/${maxRetries})`);
               retryCount++;
               continue; // 다음 반복으로 계속
             } else {
               console.log('❌ 모든 API 키의 할당량이 초과되었습니다.');
               throw new Error('ALL_QUOTA_EXCEEDED: 모든 API 키의 할당량이 초과되었습니다.');
             }
           }
           // regionCode 관련 오류인 경우 처리
           else if ((apiError.message.includes('regionCode') || apiError.message.includes('invalid region')) && searchParams.regionCode) {
          console.log('🚨 regionCode 오류 발생!');
          console.log(`  - 요청한 국가: ${country}`);
          console.log(`  - 사용한 regionCode: ${searchParams.regionCode}`);
          console.log(`  - 오류 메시지: ${apiError.message}`);
          
          // regionCode가 유효한지 다시 확인
          const validRegionCodes = [
            'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT',
            'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI',
            'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BV', 'BW', 'BY',
    'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
    'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
    'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK',
    'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL',
    'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
    'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
    'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
    'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS',
    'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
    'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
    'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
    'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
    'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
    'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
    'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF',
    'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
    'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
    'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
  ];
  
  // 유효한 코드만 반환, 그렇지 않으면 null
  return code && validRegionCodes.includes(code) ? code : null;
}

function getLanguageCode(country) {
  const languageMap = {
    'worldwide': 'en', // 전세계는 영어 기본
    'korea': 'ko',     // 한국어
    'usa': 'en',       // 영어
    'japan': 'ja',     // 일본어
    'china': 'zh',     // 중국어 (YouTube 접근 제한 고려)
    'uk': 'en',        // 영어
    'germany': 'de',   // 독일어
    'france': 'fr',    // 프랑스어
    'canada': 'en',    // 영어 (캐나다는 영어/프랑스어 혼용이지만 영어 우선)
    'australia': 'en', // 영어
    'india': 'en',     // 영어 (힌디어 등 여러 언어 있지만 영어 우선)
    'brazil': 'pt',    // 포르투갈어
    'mexico': 'es',    // 스페인어
    'russia': 'en',    // 러시아는 서비스 제한으로 영어 사용
    'italy': 'it',     // 이탈리아어
    'spain': 'es'      // 스페인어
  };
  
  return languageMap[country.toLowerCase()] || 'en';
}

function getDateRange(period) {
  const now = new Date();
  let publishedAfter = null;
  
  console.log(`업로드 기간 설정: ${period}`);
  
  switch (period) {
    case '1day':
      publishedAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '2days':
      publishedAfter = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      break;
    case '3days':
      publishedAfter = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      break;
    case '1week':
      publishedAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '2weeks':
      publishedAfter = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      break;
    case '3weeks':
      publishedAfter = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
      break;
    case '1month':
      publishedAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '3months':
      publishedAfter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '6months':
      publishedAfter = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      break;
    case '1year':
      publishedAfter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case '2years':
      publishedAfter = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '3years':
      publishedAfter = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '4years':
      publishedAfter = new Date(now.getTime() - 4 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '5years':
      publishedAfter = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '6years':
      publishedAfter = new Date(now.getTime() - 6 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '7years':
      publishedAfter = new Date(now.getTime() - 7 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '8years':
      publishedAfter = new Date(now.getTime() - 8 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '9years':
      publishedAfter = new Date(now.getTime() - 9 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '10years':
      publishedAfter = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
      break;
  }
  
  const result = {
    publishedAfter: publishedAfter ? publishedAfter.toISOString() : null,
    publishedBefore: null
  };
  
  if (publishedAfter) {
    console.log(`업로드 기간 필터링 적용됨: ${publishedAfter.toISOString()} 이후`);
  }
  
  return result;
}

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`메인 페이지: http://localhost:${PORT}`);
  console.log(`API 엔드포인트: http://localhost:${PORT}/api/search`);
  
  // API 키 사용 통계 출력
  apiKeyManager.printUsageStats();
  
  // Elasticsearch 연결 상태 확인
  if (esClient) {
    checkESConnection().then(connected => {
      if (connected) {
        console.log('✅ Elasticsearch 연결 성공');
      } else {
        console.log('❌ Elasticsearch 연결 실패, YouTube API만 사용');
      }
    });
  } else {
    console.log('📝 Elasticsearch 비활성화, YouTube API만 사용');
  }
});

// 프로세스 종료 시 정리 작업
process.on('SIGTERM', () => {
  console.log('서버 종료 중...');
  if (esClient) {
    esClient.close();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n서버 종료 중...');
  if (esClient) {
    esClient.close();
  }
  process.exit(0);
});':
      publishedAfter = new Date(now.getTime() - 7 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '8years':
      publishedAfter = new Date(now.getTime() - 8 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '9years':
      publishedAfter = new Date(now.getTime() - 9 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '10years':
      publishedAfter = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
      break;
  }
  
  const result = {
    publishedAfter: publishedAfter ? publishedAfter.toISOString() : null,
    publishedBefore: null
  };
  
  if (publishedAfter) {
    console.log(`업로드 기간 필터링 적용됨: ${publishedAfter.toISOString()} 이후`);
  }
  
  return result;
}

// YouTube duration (ISO 8601)을 초로 변환하는 함수
function parseDuration(duration) {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);
  
  if (!matches) return 0;
  
  const hours = parseInt(matches[1]) || 0;
  const minutes = parseInt(matches[2]) || 0;
  const seconds = parseInt(matches[3]) || 0;
  
  return hours * 3600 + minutes * 60 + seconds;
}

// 동영상 길이 분류 함수
function getVideoLengthCategory(durationInSeconds) {
  if (durationInSeconds < 60) return 'short1';       // 1분 미만
  if (durationInSeconds < 120) return 'short2';      // 1분 이상 2분 미만
  if (durationInSeconds < 600) return 'mid1';        // 2분 이상 10분 미만
  if (durationInSeconds < 1200) return 'mid2';       // 10분 이상 20분 미만
  if (durationInSeconds < 1800) return 'long1';      // 20분 이상 30분 미만
  if (durationInSeconds < 2400) return 'long2';      // 30분 이상 40분 미만
  if (durationInSeconds < 3000) return 'long3';      // 40분 이상 50분 미만
  if (durationInSeconds < 3600) return 'long4';      // 50분 이상 60분 미만
  if (durationInSeconds < 5400) return 'long5';      // 60분 이상 90분 미만
  return 'long6';                                    // 90분 이상
}

// 선택된 길이 카테고리와 매치되는지 확인
function matchesVideoLength(videoLengthCategory, selectedLengths) {
  if (!selectedLengths || selectedLengths.length === 0) return true;
  return selectedLengths.includes(videoLengthCategory);
}

// 채널 개설일 가져오기 (새 기능)
async function getChannelCreatedDate(channelId) {
  try {
    const youtubeInstance = apiKeyManager.getYouTubeInstance();
    const currentKey = youtubeInstance.currentKey;
    const channelResponse = await youtubeInstance.youtube.channels.list({
      part: 'snippet',
      id: channelId
    });

    if (channelResponse.data.items && channelResponse.data.items.length > 0) {
      const publishedAt = channelResponse.data.items[0].snippet.publishedAt;
      return publishedAt;
    }
    
    return null;
  } catch (error) {
    console.error(`채널 개설일 조회 오류 (${channelId}):`, error.message);
    return null;
  }
}

// 채널 설명 가져오기 (Excel용)
async function getChannelDescription(channelId) {
  try {
    const youtubeInstance = apiKeyManager.getYouTubeInstance();
    const currentKey = youtubeInstance.currentKey;
    const channelResponse = await youtubeInstance.youtube.channels.list({
      part: 'snippet',
      id: channelId
    });

    if (channelResponse.data.items && channelResponse.data.items.length > 0) {
      const description = channelResponse.data.items[0].snippet.description;
      return description || '';
    }
    
    return '';
  } catch (error) {
    console.error(`채널 설명 조회 오류 (${channelId}):`, error.message);
    return '';
  }
}

// 무료 RPM 추정 로직
function calculateFreeRPM(videoData) {
  try {
    // 1. 기본 국가별 RPM 테이블 (USD 기준)
    const baseRPM = {
      'US': 3.5, 'KR': 2.8, 'JP': 3.2, 'DE': 3.0, 'GB': 3.8,
      'CA': 3.3, 'AU': 3.6, 'FR': 2.9, 'IT': 2.4, 'ES': 2.1,
      'NL': 3.1, 'SE': 3.4, 'NO': 4.2, 'DK': 3.3, 'FI': 3.0,
      'BR': 1.8, 'MX': 1.9, 'AR': 1.5, 'IN': 1.2, 'ID': 1.1,
      'TH': 1.4, 'VN': 1.0, 'PH': 1.3, 'MY': 1.6, 'SG': 2.8,
      'worldwide': 2.5 // 전세계 평균
    };

    // 2. 카테고리별 배율 (Phase 2 세분화)
    const categoryMultiplier = {
      // 고수익 카테고리
      'Finance': 1.8, 'Business': 1.6, 'News & Politics': 1.5, 'Science & Technology': 1.4, 'Education': 1.3,
      // 중수익 카테고리  
      'Autos & Vehicles': 1.2, 'Travel & Events': 1.1, 'Howto & Style': 1.0, 'Sports': 1.0,
      // 중하위 수익 카테고리
      'People & Blogs': 0.9, 'Gaming': 0.9, 'Pets & Animals': 0.9,
      // 저수익 카테고리
      'Entertainment': 0.8, 'Film & Animation': 0.8, 'Comedy': 0.8, 'Music': 0.7, 'Nonprofits & Activism': 0.7,
      // 세부 카테고리 추가 (Phase 2)
      'Tech Reviews': 1.6, 'Crypto & Investment': 2.0, 'Real Estate': 1.7, 'Insurance': 1.9,
      'Online Learning': 1.4, 'Programming Tutorial': 1.5, 'Medical & Health': 1.3,
      'Luxury Cars': 1.4, 'Electric Vehicles': 1.3, 'Travel Vlog': 1.0, 'Food & Cooking': 0.95,
      'Beauty & Makeup': 1.1, 'Fashion': 1.0, 'Fitness': 1.1, 'Lifestyle': 0.9,
      'ASMR': 0.6, 'Kids Content': 0.5, 'Music Cover': 0.6, 'Dance': 0.7,
      'Movie Reviews': 0.9, 'TV Shows': 0.8, 'Celebrity News': 0.8,
      'Esports': 1.1, 'Mobile Games': 0.8, 'PC Games': 0.9, 'Console Games': 0.85
    };

    // 3. 기본 RPM 계산
    const country = videoData.country || 'worldwide';
    const category = videoData.primary_category || 'Entertainment';
    let rpm = baseRPM[country] || baseRPM['worldwide'];
    rpm *= categoryMultiplier[category] || 1.0;

    // 4. 조회수 기반 가중치
    const views = parseInt(videoData.daily_view_count) || 0;
    let viewMultiplier = 1.0;
    if (views < 10000) viewMultiplier = 0.7;          // 마이크로
    else if (views < 100000) viewMultiplier = 0.85;   // 스몰
    else if (views < 1000000) viewMultiplier = 1.0;   // 미디엄
    else if (views < 10000000) viewMultiplier = 1.15; // 라지
    else viewMultiplier = 1.3;                        // 휴지

    // 4-1. 시청 시간 가중치 (Phase 1)
    const durationSeconds = parseInt(videoData.duration_seconds) || 0;
    let durationMultiplier = 1.0;
    if (durationSeconds < 60) durationMultiplier = 0.8;        // Shorts (낮은 RPM)
    else if (durationSeconds < 300) durationMultiplier = 1.0;  // 5분 미만 (표준)
    else if (durationSeconds < 600) durationMultiplier = 1.15; // 5-10분 (최적)
    else if (durationSeconds < 1200) durationMultiplier = 1.25; // 10-20분 (높은 RPM)
    else durationMultiplier = 1.1;                             // 20분 이상 (약간 감소)

    // 5. 채널 성숙도 (채널 생성일 기반)
    let ageMultiplier = 1.0;
    if (videoData.channel_created_date) {
      const channelAge = (Date.now() - new Date(videoData.channel_created_date)) / (365 * 24 * 60 * 60 * 1000);
      ageMultiplier = Math.min(1.2, 0.8 + (channelAge * 0.1));
    }

    // 5-1. 구독자 비율 분석 (Phase 1)
    const subscriberCount = parseInt(videoData.subscriber_count) || 0;
    let subscriberMultiplier = 1.0;
    if (views > 0 && subscriberCount > 0) {
      const viewToSubscriberRatio = views / subscriberCount;
      if (viewToSubscriberRatio < 0.1) subscriberMultiplier = 0.85;       // 낮은 도달률
      else if (viewToSubscriberRatio < 0.5) subscriberMultiplier = 1.0;   // 표준 도달률
      else if (viewToSubscriberRatio < 2.0) subscriberMultiplier = 1.15;  // 높은 도달률
      else if (viewToSubscriberRatio < 10.0) subscriberMultiplier = 1.3;  // 바이럴 콘텐츠
      else subscriberMultiplier = 1.45;                                   // 슈퍼 바이럴
    }

    // 5-2. 계절성 패턴 반영 (Phase 1)
    let seasonalMultiplier = 1.0;
    if (videoData.status_date) {
      const uploadDate = new Date(videoData.status_date);
      const month = uploadDate.getMonth() + 1; // 1-12월
      
      // Q4 (10-12월): 광고비 최고 시즌
      if (month >= 10 && month <= 12) seasonalMultiplier = 1.25;
      // Q1 (1-3월): 광고비 높음
      else if (month >= 1 && month <= 3) seasonalMultiplier = 1.15;
      // Q2 (4-6월): 표준
      else if (month >= 4 && month <= 6) seasonalMultiplier = 1.0;
      // Q3 (7-9월): 여름 광고비 감소
      else seasonalMultiplier = 0.9;
    }

    // 6. 참여도 점수 (좋아요 기반 추정)
    let engagementMultiplier = 1.0;
    if (videoData.actual_like_count) {
      const engagementRate = videoData.actual_like_count / views;
      engagementMultiplier = 0.8 + Math.min(0.4, engagementRate * 100);
    }

    // 7. 최종 RPM 계산 (Phase 1 & 2 모든 요소 포함)
    const finalRPM = rpm * viewMultiplier * durationMultiplier * ageMultiplier * 
                     subscriberMultiplier * seasonalMultiplier * engagementMultiplier;
    
    return Math.round(finalRPM * 100) / 100; // 소수점 2자리로 반올림
  } catch (error) {
    console.log('RPM 계산 오류:', error.message);
    return 2.5; // 기본값 반환
  }
}BV', 'BW', 'BY',
            'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
            'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
            'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK',
            'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL',
            'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
            'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
            'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
            'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS',
            'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
            'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
            'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
            'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
            'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
            'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
            'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF',
            'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
            'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
            'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
          ];
          
          if (validRegionCodes.includes(searchParams.regionCode)) {
            console.log('  ❌ regionCode는 유효하지만 YouTube에서 거부됨');
            console.log('  💡 이 국가는 YouTube 서비스 제한이 있을 수 있습니다.');
          } else {
            console.log('  ❌ regionCode가 유효하지 않음');
          }
          
          console.log('  🔄 전세계 검색으로 재시도합니다...');
          const originalRegionCode = searchParams.regionCode;
          delete searchParams.regionCode;
          
          console.log('  재시도 파라미터:', {
            regionCode: '제거됨',
            relevanceLanguage: searchParams.relevanceLanguage,
            country: country,
            originalRegionCode: originalRegionCode
          });
          
             const youtube = google.youtube({ 
               version: 'v3', 
               auth: currentApiKey.key,
               timeout: 30000 // 30초 타임아웃
             });
             response = await youtube.search.list(searchParams);
             console.log('  ✅ 전세계 검색으로 성공');
             console.log(`  ⚠️  주의: "${country}" 검색이 전세계 검색으로 변경되었습니다.`);
             break; // 성공하면 루프 종료
           } else {
             console.log('복구할 수 없는 API 오류:', apiError.message);
             throw apiError; // 다른 오류는 그대로 전파
           }
         }
       }
       
       // 최대 재시도 횟수 초과 시
       if (retryCount >= maxRetries && !response) {
         throw new Error('MAX_RETRIES_EXCEEDED: 모든 API 키 재시도 실패');
       }
      
      if (!response.data.items || response.data.items.length === 0) {
        break;
      }
      
      console.log(`API 응답: ${response.data.items.length}개 동영상 발견`);

      // 비디오 ID 수집
      const videoIds = response.data.items.map(item => item.id.videoId);
      
      // 비디오 상세 정보 가져오기 (조회수, 통계 포함) - 견고한 API 키 전환 로직
      let videoDetails;
      let detailRetryCount = 0;
      const detailMaxRetries = apiKeyManager.apiKeys.length;
      
      while (detailRetryCount < detailMaxRetries) {
        try {
          const youtubeInstance = apiKeyManager.getYouTubeInstance();
          const currentDetailKey = youtubeInstance.currentKey;
          videoDetails = await youtubeInstance.youtube.videos.list({
            part: 'snippet,statistics,contentDetails',
            id: videoIds.join(',')
          });
          break; // 성공하면 루프 종료
        } catch (detailError) {
          console.error(`비디오 상세정보 조회 오류:`, detailError.message);
          
          if (detailError.message.includes('quota') || detailError.message.includes('quotaExceeded')) {
            console.log('🚫 비디오 상세정보 조회 중 할당량 초과 감지');
            
            const currentDetailKey = apiKeyManager.getCurrentKey();
            const newDetailKey = apiKeyManager.markKeyAsQuotaExceeded(currentDetailKey);
            if (newDetailKey) {
              console.log(`🔄 ${newDetailKey.name}로 비디오 상세정보 재시도... (재시도 ${detailRetryCount + 1}/${detailMaxRetries})`);
              detailRetryCount++;
              continue; // 다음 반복으로 계속
            } else {
              console.log('❌ 모든 API 키의 할당량이 초과되었습니다.');
              throw new Error('ALL_QUOTA_EXCEEDED: 모든 API 키의 할당량이 초과되었습니다.');
            }
          } else {
            throw detailError;
          }
        }
      }
      
      // 최대 재시도 횟수 초과 시
      if (detailRetryCount >= detailMaxRetries && !videoDetails) {
        throw new Error('MAX_RETRIES_EXCEEDED: 비디오 상세정보 조회 실패');
      }

      // 검색 결과 처리 (중복 제거) - 디버깅 로그 추가
      console.log(`📋 비디오 상세정보 처리 시작: ${videoDetails.data.items.length}개 동영상`);
      
      for (const video of videoDetails.data.items) {
        console.log(`\n🎬 처리 중: ${video.snippet.title.substring(0, 50)}...`);
        
        // 중복 비디오 ID 체크
        if (processedVideoIds.has(video.id)) {
          console.log(`  ❌ 중복 동영상 건너뛰기: ${video.id}`);
          continue;
        }
        
        const viewCount = parseInt(video.statistics.viewCount || 0);
        console.log(`  📊 조회수: ${viewCount.toLocaleString()}`);
        
        // 카테고리 필터링 (안전한 처리)
        let selectedCategories = [];
        if (categories) {
          if (typeof categories === 'string') {
            selectedCategories = categories.split(',').filter(c => c.trim());
          } else if (Array.isArray(categories)) {
            selectedCategories = categories.filter(c => c && typeof c === 'string' && c.trim());
          }
        }
        
        if (selectedCategories.length > 0 && !selectedCategories.includes(video.snippet.categoryId)) {
          console.log(`  ❌ 카테고리 필터링: ${video.snippet.categoryId} 제외 (선택: ${selectedCategories.join(',')})`);
          continue;
        }
        
        // 조회수 필터링
        if (minViews && viewCount < parseInt(minViews)) {
          console.log(`  ❌ 최소 조회수 미달: ${viewCount.toLocaleString()} < ${parseInt(minViews).toLocaleString()}`);
          continue;
        }
        if (maxViews && viewCount > parseInt(maxViews)) {
          console.log(`  ❌ 최대 조회수 초과: ${viewCount.toLocaleString()} > ${parseInt(maxViews).toLocaleString()}`);
          continue;
        }

        // 동영상 길이 필터링
        const durationInSeconds = parseDuration(video.contentDetails.duration);
        const videoLengthCategory = getVideoLengthCategory(durationInSeconds);
        console.log(`  ⏱️ 동영상 길이: ${durationInSeconds}초 (${videoLengthCategory})`);
        
        if (!matchesVideoLength(videoLengthCategory, selectedVideoLengths)) {
          console.log(`  ❌ 동영상 길이 필터링: ${videoLengthCategory} 제외 (선택: ${selectedVideoLengths.join(',') || '모든 길이'})`);
          continue;
        }

        // 채널 구독자 수 정보 가져오기
        console.log(`  📡 채널 구독자 수 조회 중: ${video.snippet.channelId}`);
        const subscriberCount = await getChannelSubscriberCount(video.snippet.channelId);
        console.log(`  👥 구독자 수: ${subscriberCount.toLocaleString()}`);
        
        // 채널 개설일 정보 가져오기 (새 기능)
        console.log(`  📅 채널 개설일 조회 중: ${video.snippet.channelId}`);
        const channelCreatedDate = await getChannelCreatedDate(video.snippet.channelId);
        console.log(`  🗓️ 채널 개설일: ${channelCreatedDate || '조회 안됨'}`);

        // 채널 설명 정보 가져오기 (Excel용)
        console.log(`  📝 채널 설명 조회 중: ${video.snippet.channelId}`);
        const channelDescription = await getChannelDescription(video.snippet.channelId);
        console.log(`  📄 채널 설명: ${channelDescription ? `${channelDescription.substring(0, 50)}...` : '조회 안됨'}`);

        // 실제 좋아요 개수 가져오기 (있으면 사용, 없으면 null)
        const actualLikeCount = video.statistics.likeCount ? parseInt(video.statistics.likeCount) : null;

        const result = {
          youtube_channel_name: video.snippet.channelTitle,
          thumbnail_url: video.snippet.thumbnails.maxres?.url || 
                        video.snippet.thumbnails.standard?.url || 
                        video.snippet.thumbnails.high?.url || 
                        video.snippet.thumbnails.medium?.url || 
                        video.snippet.thumbnails.default?.url,
          status: 'active',
          youtube_channel_id: video.snippet.channelId,
          primary_category: await getCategoryName(video.snippet.categoryId),
          status_date: video.snippet.publishedAt,
          daily_view_count: viewCount,
          subscriber_count: subscriberCount,
          channel_created_date: channelCreatedDate,  // 새로 추가된 필드
          actual_like_count: actualLikeCount,  // 실제 좋아요 개수 (없으면 null)
          vod_url: `https://www.youtube.com/watch?v=${video.id}`,
          video_id: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          duration: video.contentDetails.duration,
          duration_seconds: durationInSeconds,
          video_length_category: videoLengthCategory,
          // Excel용 추가 정보
          channel_description: channelDescription,  // 채널 설명
          video_tags: video.snippet.tags ? video.snippet.tags.join(', ') : '',  // 영상 태그
          country: primaryCountry  // 검색된 국가
        };

        // RPM 추정값 계산 및 추가
        result.estimated_rpm = calculateFreeRPM(result);

        // Analytics 추정 데이터 계산 및 추가
        const analyticsData = calculateEstimatedAnalytics(result);
        Object.assign(result, analyticsData);

        // 중복 제거 후 결과 추가
        searchResults.push(result);
        processedVideoIds.add(video.id); // 처리된 ID 기록
        console.log(`  ✅ 결과 추가 완료: ${searchResults.length}번째`);
        
        if (searchResults.length >= finalMaxResults) {
          console.log(`  🎯 요청된 결과 수 달성: ${finalMaxResults}개`);
          break;
        }
      }

      nextPageToken = response.data.nextPageToken;
      if (!nextPageToken) break;

      // API 호출 제한을 위한 지연 (quota 절약)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 조회수 기준 내림차순 정렬
    searchResults.sort((a, b) => b.daily_view_count - a.daily_view_count);

    // 메모리 누수 방지를 위한 메모리 정리
    try {
      processedVideoIds.clear();
      processedChannelTitles.clear();
      if (global.gc) {
        global.gc();
      }
    } catch (memError) {
      console.warn('메모리 정리 오류:', memError.message);
    }

    // 중복 제거 통계
    const totalProcessed = processedVideoIds.size + searchResults.length;
    const duplicatesRemoved = totalProcessed - searchResults.length;
    
    console.log(`검색 완료: ${searchResults.length}개 결과`);
    console.log(`🔄 중복 제거: ${duplicatesRemoved}개 중복 동영상 제거됨`);
    console.log(`📊 API 사용량: 검색 API ${Math.ceil(searchResults.length / 50)}회 + 상세정보 API ${Math.ceil(searchResults.length / 50)}회 (${finalMaxResults}건 요청 중 ${searchResults.length}건 결과)`);
    
    // API 키 사용 통계 출력
    apiKeyManager.printUsageStats();

    // ========== YouTube API 결과를 Elasticsearch에 인덱싱 ==========
    if (searchResults.length > 0) {
      console.log('📝 YouTube API 결과를 Elasticsearch에 인덱싱 중...');
      try {
        await esHelper.bulkUpsertVideos(searchResults, searchParameters);
        console.log('✅ Elasticsearch 인덱싱 완료');
      } catch (esError) {
        console.error('⚠️ Elasticsearch 인덱싱 실패:', esError.message);
        console.log('💡 YouTube API 결과는 정상 반환하지만 캐시 저장은 실패했습니다.');
      }
    }
    // ========== Elasticsearch 인덱싱 끝 ==========

    // 검색 소요시간 계산 및 출력
    const searchEndTime = Date.now();
    const searchDuration = searchEndTime - searchStartTime;
    const durationSeconds = (searchDuration / 1000).toFixed(2);
    
    console.log(`\n⏱️ 검색 완료: 총 소요시간 ${durationSeconds}초 (${searchResults.length}개 결과)`);
    console.log(`🔍 검색 조건: ${country}/${keyword || '키워드 없음'}/${finalMaxResults}건`);
    console.log('='.repeat(52));

    res.json({
      success: true,
      data: searchResults,
      total: searchResults.length,
      source: 'youtube_api_with_es_cache',
      searchDuration: `${durationSeconds}초`
    });

  } catch (error) {
    console.error('검색 오류:', error);
    
    // 오류 발생 시에도 소요시간 출력
    const errorEndTime = Date.now();
    const errorDuration = errorEndTime - searchStartTime;
    const errorDurationSeconds = (errorDuration / 1000).toFixed(2);
    
    console.log(`\n⚠️ 검색 실패: 소요시간 ${errorDurationSeconds}초`);
    console.log('='.repeat(52));
    
    // API 키 사용 통계 출력 (오류 발생 시에도)
    apiKeyManager.printUsageStats();
    
    // YouTube API quota 초과 오류 처리 - 수정된 로직
    if (error.message.includes('quota') || error.message.includes('quotaExceeded')) {
      console.error('YouTube API 할당량 초과 감지');
      
      // 실제로 사용 가능한 키가 있는지 확인
      const availableKeys = apiKeyManager.apiKeys.filter(key => !key.quotaExceeded);
      const totalKeys = apiKeyManager.apiKeys.length;
      const exhaustedKeys = totalKeys - availableKeys.length;
      
      // 사용 가능한 키가 있으면 429 에러를 반환하지 않고 재시도 유도
      if (availableKeys.length > 0) {
        console.log(`사용 가능한 API 키가 ${availableKeys.length}개 남아있음, 이 오류는 내부 처리 중 발생한 일시적 오류입니다.`);
        
        // 500 에러로 반환하여 클라이언트가 재시도할 수 있도록 함
        res.status(500).json({
          success: false,
          error: error.message
        };
      }
    });

    // 모든 수익 데이터 수집 완료 대기
    const results = await Promise.all(revenuePromises);
    
    // 결과 통계
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`✅ YouTube Analytics 수익 데이터 조회 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    // 응답 반환
    res.json({
      success: true,
      data: results,
      summary: {
        total: channelIds.length,
        successful: successCount,
        failed: failCount,
        period: `${validStartDate} ~ ${validEndDate}`
      },
      cacheStats: analyticsManager.getCacheStats()
    });

  } catch (error) {
    console.error('YouTube Analytics API 조회 오류:', error);
    res.status(500).json({ 
      success: false,
      error: '수익 데이터 조회에 실패했습니다.',
      details: error.message
    });
  }
});

// Excel 다운로드 API
app.post('/api/download-excel', async (req, res) => {
  try {
    const { searchResults, searchParams } = req.body;
    
    if (!searchResults || !Array.isArray(searchResults)) {
      return res.status(400).json({ error: '검색 결과 데이터가 필요합니다.' });
    }

    // 대용량 데이터 제한 추가
    if (searchResults.length > 1000) {
      return res.status(413).json({ 
        error: '결과가 너무 많습니다. 1000건 이하로 필터링해주세요.',
        maxAllowed: 1000,
        currentCount: searchResults.length
      });
    }

    // 💰 Analytics 추정 데이터 포함하여 Excel 생성
    console.log('📊 Phase 1&2 고도화 추정 로직으로 Analytics 데이터 생성 중...');
    
    // Excel용 데이터 변환 (Analytics 추정 데이터 포함)
    const excelData = searchResults.map((result, index) => {
      
      return {
        '순번': index + 1,
        '채널명': result.youtube_channel_name || '',
        '채널 ID': result.youtube_channel_id || '',
        '채널 설명': result.channel_description || '',
        '동영상 제목': result.title || '',
        '동영상 설명': result.description || '',
        '태그': result.video_tags || '',
        '카테고리': result.primary_category || '',
        '국가': result.country || '',
        '업로드일': result.status_date ? new Date(result.status_date).toLocaleDateString('ko-KR') : '',
        '조회수': parseInt(result.daily_view_count || 0).toLocaleString(),
        '구독자': formatSubscriberCountForExcel(result.subscriber_count || 0),
        '추정 RPM': result.estimated_rpm ? `${result.estimated_rpm}` : '',
        'URL': result.vod_url || '',
        '시간(초)': result.duration_seconds || 0,
        '시간(형식)': formatDurationForExcel(result.duration_seconds),
        '동영상 길이': formatVideoLengthForExcel(result.video_length_category) || '',
        '상태': result.status || '',
        '썸네일 URL': result.thumbnail_url || '',
        // 🎯 Analytics 추정 데이터 (Phase 1&2 고도화 로직 적용) - 썸네일 URL 다음에 배치
        'Analytics 조회수': result.views ? result.views.toLocaleString() : '0',
        '추정 시청시간(분)': result.estimatedMinutesWatched ? result.estimatedMinutesWatched.toLocaleString() : '0',
        '평균 시청시간(초)': result.averageViewDuration ? result.averageViewDuration.toLocaleString() : '0',
        '신규 구독자 수': result.subscribersGained ? result.subscribersGained.toLocaleString() : '0',
        '광고 노출 수': result.adImpressions ? result.adImpressions.toLocaleString() : '0',
        '추정 총수익($)': result.estimatedRevenue ? `${result.estimatedRevenue}` : '$0.00',
        '추정 광고수익($)': result.estimatedAdRevenue ? `${result.estimatedAdRevenue}` : '$0.00',
        '추정 Premium수익($)': result.estimatedRedPartnerRevenue ? `${result.estimatedRedPartnerRevenue}` : '$0.00',
        '재생기반 CPM($)': result.playbackBasedCpm ? `${result.playbackBasedCpm}` : '$0.00',
        '광고 CPM($)': result.adCpm ? `${result.adCpm}` : '$0.00',
        // 🎯 추가 RPM 데이터 (맨 마지막) - CPM > RPM 관계 올바르게 구현
        '재생기반 RPM($)': result.estimated_rpm ? `${result.estimated_rpm}` : '$0.00',
        '광고 RPM($)': result.estimated_rpm ? `${Math.round(result.estimated_rpm * 0.72 * 100) / 100}` : '$0.00'
      };
    });

    // 워크북 생성
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 컴럼 너비 자동 조정 (Analytics 데이터 컴럼 포함)
    const columnWidths = [
      { wch: 6 },  // 순번
      { wch: 25 }, // 채널명
      { wch: 20 }, // 채널 ID
      { wch: 50 }, // 채널 설명
      { wch: 40 }, // 동영상 제목
      { wch: 60 }, // 동영상 설명
      { wch: 30 }, // 태그
      { wch: 15 }, // 카테고리
      { wch: 12 }, // 국가
      { wch: 12 }, // 업로드일
      { wch: 12 }, // 조회수
      { wch: 12 }, // 구독자
      { wch: 10 }, // 추정 RPM
      { wch: 50 }, // URL
      { wch: 8 },  // 시간(초)
      { wch: 10 }, // 시간(형식)
      { wch: 12 }, // 동영상 길이
      { wch: 10 }, // 상태
      { wch: 50 }, // 썸네일 URL
      // 🎯 Analytics 추정 데이터 컴럼들 (썸네일 URL 다음에 배치)
      { wch: 15 }, // Analytics 조회수
      { wch: 18 }, // 추정 시청시간(분)
      { wch: 18 }, // 평균 시청시간(초)
      { wch: 15 }, // 신규 구독자 수
      { wch: 15 }, // 광고 노출 수
      { wch: 16 }, // 추정 총수익($)
      { wch: 18 }, // 추정 광고수익($)
      { wch: 20 }, // 추정 Premium수익($)
      { wch: 16 }, // 재생기반 CPM($)
      { wch: 14 }, // 광고 CPM($)
      // 🎯 추가 RPM 데이터 (맨 마지막)
      { wch: 16 }, // 재생기반 RPM($)
      { wch: 14 }  // 광고 RPM($)
    ];
    worksheet['!cols'] = columnWidths;

    // 워크시트를 워크북에 추가
    XLSX.utils.book_append_sheet(workbook, worksheet, 'YouTube 검색 결과');

    // Excel 파일을 버퍼로 생성
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true 
    });

    // 파일명 생성 (검색 조건 포함) - 대한민국 시간 기준
    const now = new Date();
    const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9 (대한민국 시간)
    const timestamp = kstTime.toISOString().slice(0, 19).replace(/:/g, '-');
    const keyword = searchParams?.keyword || '전체';
    const country = searchParams?.country || 'worldwide';
    const resultCount = searchResults.length;
    
    // 날짜 범위 정보 포함
    let dateRangeStr = '';
    if (searchParams?.startDate || searchParams?.endDate) {
      const startDateStr = searchParams?.startDate ? searchParams.startDate.replace(/-/g, '') : '';
      const endDateStr = searchParams?.endDate ? searchParams.endDate.replace(/-/g, '') : '';
      if (startDateStr && endDateStr) {
        dateRangeStr = `_${startDateStr}-${endDateStr}`;
      } else if (startDateStr) {
        dateRangeStr = `_${startDateStr}이후`;
      } else if (endDateStr) {
        dateRangeStr = `_${endDateStr}이전`;
      }
    } else if (searchParams?.uploadPeriod) {
      dateRangeStr = `_${searchParams.uploadPeriod}`;
    }
    
    const filename = `YouTube_${keyword}_${country}${dateRangeStr}_[${resultCount}]_${timestamp}.xlsx`;

    // 응답 헤더 설정
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', excelBuffer.length);

    // Excel 파일 전송
    res.send(excelBuffer);

    console.log(`✅ Excel 파일 생성 완료: ${filename} (${searchResults.length}행, 수익 데이터 포함)`);

  } catch (error) {
    console.error('Excel 다운로드 오류:', error);
    res.status(500).json({ error: 'Excel 파일 생성에 실패했습니다.' });
  }
}); '일시적인 API 키 전환 오류가 발생했습니다. 잠시 후 재시도해 주세요.',
          errorType: 'temporary_api_key_switch_error',
          details: `${availableKeys.length}개의 API 키가 사용 가능합니다.`,
          keyStats: {
            total: totalKeys,
            available: availableKeys.length,
            exhausted: exhaustedKeys
          }
        });
      } else {
        // 모든 키가 실제로 소진된 경우에만 429 에러 반환
        console.error('모든 YouTube API 키의 할당량이 초과됨');
        res.status(429).json({
          success: false,
          error: `YouTube API 일일 할당량을 초과했습니다. (${exhaustedKeys}/${totalKeys} 키 사용됨)`,
          errorType: 'quota_exceeded',
          details: '모든 API 키의 할당량이 초과되었습니다. 내일 자동으로 할당량이 재설정됩니다.',
          keyStats: {
            total: totalKeys,
            available: availableKeys.length,
            exhausted: exhaustedKeys
          }
        });
      }
    } else if (error.message.includes('API key')) {
      console.error('YouTube API 키 오류');
      res.status(401).json({
        success: false,
        error: 'YouTube API 키가 유효하지 않습니다. 관리자에게 문의하세요.',
        errorType: 'invalid_api_key'
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        errorType: 'general_error'
      });
    }
  }
});beInstance.youtube.search.list(searchParams);
          break; // 성공하면 루프 종료
        } catch (apiError) {
          console.error(`YouTube API 오류 (${currentApiKey.name}):`, apiError.message);
           
           // 할당량 초과 오류인 경우 다음 키로 전환
           if (apiError.message.includes('quota') || apiError.message.includes('quotaExceeded')) {
             console.log(`🚫 ${currentApiKey.name} 할당량 초과 감지`);
             
             const newApiKey = apiKeyManager.markKeyAsQuotaExceeded(currentApiKey);
             if (newApiKey) {
               console.log(`🔄 ${newApiKey.name}로 재시도합니다... (재시도 ${retryCount + 1}/${maxRetries})`);
               retryCount++;
               continue; // 다음 반복으로 계속
             } else {
               console.log('❌ 모든 API 키의 할당량이 초과되었습니다.');
               throw new Error('ALL_QUOTA_EXCEEDED: 모든 API 키의 할당량이 초과되었습니다.');
             }
           }
           // regionCode 관련 오류인 경우 처리
           else if ((apiError.message.includes('regionCode') || apiError.message.includes('invalid region')) && searchParams.regionCode) {
          console.log('🚨 regionCode 오류 발생!');
          console.log(`  - 요청한 국가: ${country}`);
          console.log(`  - 사용한 regionCode: ${searchParams.regionCode}`);
          console.log(`  - 오류 메시지: ${apiError.message}`);
          
          // regionCode가 유효한지 다시 확인
          const validRegionCodes = [
            'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT',
            'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI',
            'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY',
            'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
            'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
            'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK',
            'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL',
            'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
            'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
            'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
            'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS',
            'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
            'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
            'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
            'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
            'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
            'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
            'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF',
            'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
            'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
            'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
          ];
          
          if (validRegionCodes.includes(searchParams.regionCode)) {
            console.log('  ❌ regionCode는 유효하지만 YouTube에서 거부됨');
            console.log('  💡 이 국가는 YouTube 서비스 제한이 있을 수 있습니다.');
          } else {
            console.log('  ❌ regionCode가 유효하지 않음');
          }
          
          console.log('  🔄 전세계 검색으로 재시도합니다...');
          const originalRegionCode = searchParams.regionCode;
          delete searchParams.regionCode;
          
          console.log('  재시도 파라미터:', {
            regionCode: '제거됨',
            relevanceLanguage: searchParams.relevanceLanguage,
            country: country,
            originalRegionCode: originalRegionCode
          });
          
             const youtube = google.youtube({ 
               version: 'v3', 
               auth: currentApiKey.key,
               timeout: 30000 // 30초 타임아웃
             });
             response = await youtube.search.list(searchParams);
             console.log('  ✅ 전세계 검색으로 성공');
             console.log(`  ⚠️  주의: "${country}" 검색이 전세계 검색으로 변경되었습니다.`);
             break; // 성공하면 루프 종료
           } else {
             console.log('복구할 수 없는 API 오류:', apiError.message);
             throw apiError; // 다른 오류는 그대로 전파
           }
         }
       }
       
       // 최대 재시도 횟수 초과 시
       if (retryCount >= maxRetries && !response) {
         throw new Error('MAX_RETRIES_EXCEEDED: 모든 API 키 재시도 실패');
       }
      
      if (!response.data.items || response.data.items.length === 0) {
        break;
      }
      
      console.log(`API 응답: ${response.data.items.length}개 동영상 발견`);

      // 비디오 ID 수집
      const videoIds = response.data.items.map(item => item.id.videoId);
      
      // 비디오 상세 정보 가져오기 (조회수, 통계 포함) - 견고한 API 키 전환 로직
      let videoDetails;
      let detailRetryCount = 0;
      const detailMaxRetries = apiKeyManager.apiKeys.length;
      
      while (detailRetryCount < detailMaxRetries) {
        try {
          const youtubeInstance = apiKeyManager.getYouTubeInstance();
          const currentDetailKey = youtubeInstance.currentKey;
          videoDetails = await youtubeInstance.youtube.videos.list({
            part: 'snippet,statistics,contentDetails',
            id: videoIds.join(',')
          });
          break; // 성공하면 루프 종료
        } catch (detailError) {
          console.error(`비디오 상세정보 조회 오류:`, detailError.message);
          
          if (detailError.message.includes('quota') || detailError.message.includes('quotaExceeded')) {
            console.log('🚫 비디오 상세정보 조회 중 할당량 초과 감지');
            
            const currentDetailKey = apiKeyManager.getCurrentKey();
            const newDetailKey = apiKeyManager.markKeyAsQuotaExceeded(currentDetailKey);
            if (newDetailKey) {
              console.log(`🔄 ${newDetailKey.name}로 비디오 상세정보 재시도... (재시도 ${detailRetryCount + 1}/${detailMaxRetries})`);
              detailRetryCount++;
              continue; // 다음 반복으로 계속
            } else {
              console.log('❌ 모든 API 키의 할당량이 초과되었습니다.');
              throw new Error('ALL_QUOTA_EXCEEDED: 모든 API 키의 할당량이 초과되었습니다.');
            }
          } else {
            throw detailError;
          }
        }
      }
      
      // 최대 재시도 횟수 초과 시
      if (detailRetryCount >= detailMaxRetries && !videoDetails) {
        throw new Error('MAX_RETRIES_EXCEEDED: 비디오 상세정보 조회 실패');
      }

             // 검색 결과 처리 (중복 제거) - 디버깅 로그 추가
       console.log(`📋 비디오 상세정보 처리 시작: ${videoDetails.data.items.length}개 동영상`);
       
       for (const video of videoDetails.data.items) {
         console.log(`\n🎬 처리 중: ${video.snippet.title.substring(0, 50)}...`);
         
         // 중복 비디오 ID 체크
         if (processedVideoIds.has(video.id)) {
           console.log(`  ❌ 중복 동영상 건너뛰기: ${video.id}`);
           continue;
         }
         
         const viewCount = parseInt(video.statistics.viewCount || 0);
         console.log(`  📊 조회수: ${viewCount.toLocaleString()}`);
         
         // 카테고리 필터링 (안전한 처리)
         let selectedCategories = [];
         if (categories) {
           if (typeof categories === 'string') {
             selectedCategories = categories.split(',').filter(c => c.trim());
           } else if (Array.isArray(categories)) {
             selectedCategories = categories.filter(c => c && typeof c === 'string' && c.trim());
           }
         }
         
         if (selectedCategories.length > 0 && !selectedCategories.includes(video.snippet.categoryId)) {
           console.log(`  ❌ 카테고리 필터링: ${video.snippet.categoryId} 제외 (선택: ${selectedCategories.join(',')})`);
           continue;
         }
         
         // 조회수 필터링
         if (minViews && viewCount < parseInt(minViews)) {
           console.log(`  ❌ 최소 조회수 미달: ${viewCount.toLocaleString()} < ${parseInt(minViews).toLocaleString()}`);
           continue;
         }
         if (maxViews && viewCount > parseInt(maxViews)) {
           console.log(`  ❌ 최대 조회수 초과: ${viewCount.toLocaleString()} > ${parseInt(maxViews).toLocaleString()}`);
           continue;
         }

         // 동영상 길이 필터링
         const durationInSeconds = parseDuration(video.contentDetails.duration);
         const videoLengthCategory = getVideoLengthCategory(durationInSeconds);
         console.log(`  ⏱️ 동영상 길이: ${durationInSeconds}초 (${videoLengthCategory})`);
         
         if (!matchesVideoLength(videoLengthCategory, selectedVideoLengths)) {
           console.log(`  ❌ 동영상 길이 필터링: ${videoLengthCategory} 제외 (선택: ${selectedVideoLengths.join(',') || '모든 길이'})`);
           continue;
         }

        // 채널 구독자 수 정보 가져오기
        console.log(`  📡 채널 구독자 수 조회 중: ${video.snippet.channelId}`);
        const subscriberCount = await getChannelSubscriberCount(video.snippet.channelId);
        console.log(`  👥 구독자 수: ${subscriberCount.toLocaleString()}`);
        
        // 채널 개설일 정보 가져오기 (새 기능)
        console.log(`  📅 채널 개설일 조회 중: ${video.snippet.channelId}`);
        const channelCreatedDate = await getChannelCreatedDate(video.snippet.channelId);
        console.log(`  🗓️ 채널 개설일: ${channelCreatedDate || '조회 안됨'}`);

        // 채널 설명 정보 가져오기 (Excel용)
        console.log(`  📝 채널 설명 조회 중: ${video.snippet.channelId}`);
        const channelDescription = await getChannelDescription(video.snippet.channelId);
        console.log(`  📄 채널 설명: ${channelDescription ? `${channelDescription.substring(0, 50)}...` : '조회 안됨'}`);

        // 실제 좋아요 개수 가져오기 (있으면 사용, 없으면 null)
        const actualLikeCount = video.statistics.likeCount ? parseInt(video.statistics.likeCount) : null;

        const result = {
          youtube_channel_name: video.snippet.channelTitle,
          thumbnail_url: video.snippet.thumbnails.maxres?.url || 
                        video.snippet.thumbnails.standard?.url || 
                        video.snippet.thumbnails.high?.url || 
                        video.snippet.thumbnails.medium?.url || 
                        video.snippet.thumbnails.default?.url,
          status: 'active',
          youtube_channel_id: video.snippet.channelId,
          primary_category: await getCategoryName(video.snippet.categoryId),
          status_date: video.snippet.publishedAt,
          daily_view_count: viewCount,
          subscriber_count: subscriberCount,
          channel_created_date: channelCreatedDate,  // 새로 추가된 필드
          actual_like_count: actualLikeCount,  // 실제 좋아요 개수 (없으면 null)
          vod_url: `https://www.youtube.com/watch?v=${video.id}`,
          video_id: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          duration: video.contentDetails.duration,
          duration_seconds: durationInSeconds,
          video_length_category: videoLengthCategory,
          // Excel용 추가 정보
          channel_description: channelDescription,  // 채널 설명
          video_tags: video.snippet.tags ? video.snippet.tags.join(', ') : '',  // 영상 태그
          country: primaryCountry  // 검색된 국가
        };

        // RPM 추정값 계산 및 추가
        result.estimated_rpm = calculateFreeRPM(result);

        // Analytics 추정 데이터 계산 및 추가
        const analyticsData = calculateEstimatedAnalytics(result);
        Object.assign(result, analyticsData);

         // 중복 제거 후 결과 추가
         searchResults.push(result);
         processedVideoIds.add(video.id); // 처리된 ID 기록
         console.log(`  ✅ 결과 추가 완료: ${searchResults.length}번째`);
         
         if (searchResults.length >= finalMaxResults) {
           console.log(`  🎯 요청된 결과 수 달성: ${finalMaxResults}개`);
           break;
         }
       }

      nextPageToken = response.data.nextPageToken;
      if (!nextPageToken) break;

      // API 호출 제한을 위한 지연 (quota 절약)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

         // 조회수 기준 내림차순 정렬
     searchResults.sort((a, b) => b.daily_view_count - a.daily_view_count);

     // 메모리 누수 방지를 위한 메모리 정리
     try {
       processedVideoIds.clear();
       processedChannelTitles.clear();
       if (global.gc) {
         global.gc();
       }
     } catch (memError) {
       console.warn('메모리 정리 오류:', memError.message);
     }

     // 중복 제거 통계
     const totalProcessed = processedVideoIds.size + searchResults.length;
     const duplicatesRemoved = totalProcessed - searchResults.length;
     
     console.log(`검색 완료: ${searchResults.length}개 결과`);
     console.log(`🔄 중복 제거: ${duplicatesRemoved}개 중복 동영상 제거됨`);
     console.log(`📊 API 사용량: 검색 API ${Math.ceil(searchResults.length / 50)}회 + 상세정보 API ${Math.ceil(searchResults.length / 50)}회 (${finalMaxResults}건 요청 중 ${searchResults.length}건 결과)`);
     
     // API 키 사용 통계 출력
     apiKeyManager.printUsageStats();

     // ========== YouTube API 결과를 Elasticsearch에 인덱싱 ==========
     if (searchResults.length > 0) {
     console.log('📝 YouTube API 결과를 Elasticsearch에 인덱싱 중...');
     try {
     await esHelper.bulkUpsertVideos(searchResults, searchParameters);
     console.log('✅ Elasticsearch 인덱싱 완료');
     } catch (esError) {
     console.error('⚠️ Elasticsearch 인덱싱 실패:', esError.message);
     console.log('💡 YouTube API 결과는 정상 반환하지만 캐시 저장은 실패했습니다.');
     }
     }
     // ========== Elasticsearch 인덱싱 끝 ==========

     // 검색 소요시간 계산 및 출력
     const searchEndTime = Date.now();
     const searchDuration = searchEndTime - searchStartTime;
     const durationSeconds = (searchDuration / 1000).toFixed(2);
     
     console.log(`\n⏱️ 검색 완료: 총 소요시간 ${durationSeconds}초 (${searchResults.length}개 결과)`);
    console.log(`🔍 검색 조건: ${country}/${keyword || '키워드 없음'}/${finalMaxResults}건`);
    console.log('='.repeat(52));

    res.json({
      success: true,
      data: searchResults,
      total: searchResults.length,
      source: 'youtube_api_with_es_cache',
      searchDuration: `${durationSeconds}초`
    });

  } catch (error) {
    console.error('검색 오류:', error);
    
    // 오류 발생 시에도 소요시간 출력
    const errorEndTime = Date.now();
    const errorDuration = errorEndTime - searchStartTime;
    const errorDurationSeconds = (errorDuration / 1000).toFixed(2);
    
    console.log(`\n⚠️ 검색 실패: 소요시간 ${errorDurationSeconds}초`);
    console.log('='.repeat(52));
    
    // API 키 사용 통계 출력 (오류 발생 시에도)
    apiKeyManager.printUsageStats();
    
    // YouTube API quota 초과 오류 처리 - 수정된 로직
    if (error.message.includes('quota') || error.message.includes('quotaExceeded')) {
      console.error('YouTube API 할당량 초과 감지');
      
      // 실제로 사용 가능한 키가 있는지 확인
      const availableKeys = apiKeyManager.apiKeys.filter(key => !key.quotaExceeded);
      const totalKeys = apiKeyManager.apiKeys.length;
      const exhaustedKeys = totalKeys - availableKeys.length;
      
      // 사용 가능한 키가 있으면 429 에러를 반환하지 않고 재시도 유도
      if (availableKeys.length > 0) {
        console.log(`사용 가능한 API 키가 ${availableKeys.length}개 남아있음, 이 오류는 내부 처리 중 발생한 일시적 오류입니다.`);
        
        // 500 에러로 반환하여 클라이언트가 재시도할 수 있도록 함
        res.status(500).json({
          success: false,
          error: '일시적인 API 키 전환 오류가 발생했습니다. 잠시 후 재시도해 주세요.',
          errorType: 'temporary_api_key_switch_error',
          details: `${availableKeys.length}개의 API 키가 사용 가능합니다.`,
          keyStats: {
            total: totalKeys,
            available: availableKeys.length,
            exhausted: exhaustedKeys
          }
        });
      } else {
        // 모든 키가 실제로 소진된 경우에만 429 에러 반환
        console.error('모든 YouTube API 키의 할당량이 초과됨');
        res.status(429).json({
          success: false,
          error: `YouTube API 일일 할당량을 초과했습니다. (${exhaustedKeys}/${totalKeys} 키 사용됨)`,
          errorType: 'quota_exceeded',
          details: '모든 API 키의 할당량이 초과되었습니다. 내일 자동으로 할당량이 재설정됩니다.',
          keyStats: {
            total: totalKeys,
            available: availableKeys.length,
            exhausted: exhaustedKeys
          }
        });
      }
    } else if (error.message.includes('API key')) {
      console.error('YouTube API 키 오류');
      res.status(401).json({
        success: false,
        error: 'YouTube API 키가 유효하지 않습니다. 관리자에게 문의하세요.',
        errorType: 'invalid_api_key'
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        errorType: 'general_error'
      });
    }
  }
});

// 썸네일 다운로드 API는 아래에 개선된 버전이 있습니다.

// YouTube Analytics 수익 데이터 조회 API
app.post('/api/get-revenue-data', async (req, res) => {
  try {
    const { channelIds, startDate, endDate } = req.body;
    
    if (!channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: '채널 ID 목록이 필요합니다.' 
      });
    }

    // 대량 요청 제한
    if (channelIds.length > 50) {
      return res.status(413).json({ 
        success: false,
        error: '한 번에 최대 50개 채널까지 조회 가능합니다.',
        maxAllowed: 50,
        currentCount: channelIds.length
      });
    }

    // 날짜 범위 밸리데이션
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const validEndDate = endDate || defaultEndDate;
    const validStartDate = startDate || defaultStartDate;

    console.log(`📊 YouTube Analytics API 수익 데이터 조회 시작: ${channelIds.length}개 채널`);
    console.log(`📅 조회 기간: ${validStartDate} ~ ${validEndDate}`);

    // 병렬로 모든 채널의 수익 데이터 조회
    const revenuePromises = channelIds.map(async (channelId, index) => {
      try {
        console.log(`💰 ${index + 1}/${channelIds.length} 채널 수익 조회: ${channelId}`);
        
        const revenueData = await analyticsManager.getRevenueMetrics(
          channelId,
          validStartDate,
          validEndDate
        );
        
        return {
          channelId: channelId,
          revenueData: revenueData,
          success: true
        };
      } catch (error) {
        console.error(`수익 데이터 조회 실패 (${channelId}):`, error.message);
        return {
          channelId: channelId,
          revenueData: analyticsManager.createEmptyRevenueData('조회 실패: ' + error.message),
          success: false,
          error: error.message
        };
      }
    });

    // 모든 수익 데이터 수집 완료 대기
    const results = await Promise.all(revenuePromises);
    
    // 결과 통계
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`✅ YouTube Analytics 수익 데이터 조회 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    // 응답 반환
    res.json({
      success: true,
      data: results,
      summary: {
        total: channelIds.length,
        successful: successCount,
        failed: failCount,
        period: `${validStartDate} ~ ${validEndDate}`
      },
      cacheStats: analyticsManager.getCacheStats()
    });

  } catch (error) {
    console.error('YouTube Analytics API 조회 오류:', error);
    res.status(500).json({ 
      success: false,
      error: '수익 데이터 조회에 실패했습니다.',
      details: error.message
    });
  }
});

// Excel 다운로드 API
app.post('/api/download-excel', async (req, res) => {
  try {
    const { searchResults, searchParams } = req.body;
    
    if (!searchResults || !Array.isArray(searchResults)) {
      return res.status(400).json({ error: '검색 결과 데이터가 필요합니다.' });
    }

    // 대용량 데이터 제한 추가
    if (searchResults.length > 1000) {
      return res.status(413).json({ 
        error: '결과가 너무 많습니다. 1000건 이하로 필터링해주세요.',
        maxAllowed: 1000,
        currentCount: searchResults.length
      });
    }

    // 💰 Analytics 추정 데이터 포함하여 Excel 생성
    console.log('📊 Phase 1&2 고도화 추정 로직으로 Analytics 데이터 생성 중...');
    
    // Excel용 데이터 변환 (Analytics 추정 데이터 포함)
    const excelData = searchResults.map((result, index) => {
      
      return {
        '순번': index + 1,
        '채널명': result.youtube_channel_name || '',
        '채널 ID': result.youtube_channel_id || '',
        '채널 설명': result.channel_description || '',
        '동영상 제목': result.title || '',
        '동영상 설명': result.description || '',
        '태그': result.video_tags || '',
        '카테고리': result.primary_category || '',
        '국가': result.country || '',
        '업로드일': result.status_date ? new Date(result.status_date).toLocaleDateString('ko-KR') : '',
        '조회수': parseInt(result.daily_view_count || 0).toLocaleString(),
        '구독자': formatSubscriberCountForExcel(result.subscriber_count || 0),
        '추정 RPM': result.estimated_rpm ? `${result.estimated_rpm}` : '',
        'URL': result.vod_url || '',
        '시간(초)': result.duration_seconds || 0,
        '시간(형식)': formatDurationForExcel(result.duration_seconds),
        '동영상 길이': formatVideoLengthForExcel(result.video_length_category) || '',
        '상태': result.status || '',
        '썸네일 URL': result.thumbnail_url || '',
        // 🎯 Analytics 추정 데이터 (Phase 1&2 고도화 로직 적용) - 썸네일 URL 다음에 배치
        'Analytics 조회수': result.views ? result.views.toLocaleString() : '0',
        '추정 시청시간(분)': result.estimatedMinutesWatched ? result.estimatedMinutesWatched.toLocaleString() : '0',
        '평균 시청시간(초)': result.averageViewDuration ? result.averageViewDuration.toLocaleString() : '0',
        '신규 구독자 수': result.subscribersGained ? result.subscribersGained.toLocaleString() : '0',
        '광고 노출 수': result.adImpressions ? result.adImpressions.toLocaleString() : '0',
        '추정 총수익($)': result.estimatedRevenue ? `$${result.estimatedRevenue}` : '$0.00',
        '추정 광고수익($)': result.estimatedAdRevenue ? `$${result.estimatedAdRevenue}` : '$0.00',
        '추정 Premium수익($)': result.estimatedRedPartnerRevenue ? `$${result.estimatedRedPartnerRevenue}` : '$0.00',
        '재생기반 CPM($)': result.playbackBasedCpm ? `$${result.playbackBasedCpm}` : '$0.00',
        '광고 CPM($)': result.adCpm ? `$${result.adCpm}` : '$0.00',
        // 🎯 추가 RPM 데이터 (맨 마지막) - CPM > RPM 관계 올바르게 구현
        '재생기반 RPM($)': result.estimated_rpm ? `$${result.estimated_rpm}` : '$0.00',
        '광고 RPM($)': result.estimated_rpm ? `$${Math.round(result.estimated_rpm * 0.85 * 100) / 100}` : '$0.00'
      };
    });

    // 워크북 생성
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 컬럼 너비 자동 조정 (Analytics 데이터 컬럼 포함)
    const columnWidths = [
      { wch: 6 },  // 순번
      { wch: 25 }, // 채널명
      { wch: 20 }, // 채널 ID
      { wch: 50 }, // 채널 설명
      { wch: 40 }, // 동영상 제목
      { wch: 60 }, // 동영상 설명
      { wch: 30 }, // 태그
      { wch: 15 }, // 카테고리
      { wch: 12 }, // 국가
      { wch: 12 }, // 업로드일
      { wch: 12 }, // 조회수
      { wch: 12 }, // 구독자
      { wch: 10 }, // 추정 RPM
      { wch: 50 }, // URL
      { wch: 8 },  // 시간(초)
      { wch: 10 }, // 시간(형식)
      { wch: 12 }, // 동영상 길이
      { wch: 10 }, // 상태
      { wch: 50 }, // 썸네일 URL
      // 🎯 Analytics 추정 데이터 컬럼들 (썸네일 URL 다음에 배치)
      { wch: 15 }, // Analytics 조회수
      { wch: 18 }, // 추정 시청시간(분)
      { wch: 18 }, // 평균 시청시간(초)
      { wch: 15 }, // 신규 구독자 수
      { wch: 15 }, // 광고 노출 수
      { wch: 16 }, // 추정 총수익($)
      { wch: 18 }, // 추정 광고수익($)
      { wch: 20 }, // 추정 Premium수익($)
      { wch: 16 }, // 재생기반 CPM($)
      { wch: 14 }, // 광고 CPM($)
      // 🎯 추가 RPM 데이터 (맨 마지막)
      { wch: 16 }, // 재생기반 RPM($)
      { wch: 14 }  // 광고 RPM($)
    ];
    worksheet['!cols'] = columnWidths;

    // 워크시트를 워크북에 추가
    XLSX.utils.book_append_sheet(workbook, worksheet, 'YouTube 검색 결과');

    // Excel 파일을 버퍼로 생성
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true 
    });

    // 파일명 생성 (검색 조건 포함) - 대한민국 시간 기준
    const now = new Date();
    const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9 (대한민국 시간)
    const timestamp = kstTime.toISOString().slice(0, 19).replace(/:/g, '-');
    const keyword = searchParams?.keyword || '전체';
    const country = searchParams?.country || 'worldwide';
    const resultCount = searchResults.length;
    
    // 날짜 범위 정보 포함
    let dateRangeStr = '';
    if (searchParams?.startDate || searchParams?.endDate) {
      const startDateStr = searchParams?.startDate ? searchParams.startDate.replace(/-/g, '') : '';
      const endDateStr = searchParams?.endDate ? searchParams.endDate.replace(/-/g, '') : '';
      if (startDateStr && endDateStr) {
        dateRangeStr = `_${startDateStr}-${endDateStr}`;
      } else if (startDateStr) {
        dateRangeStr = `_${startDateStr}이후`;
      } else if (endDateStr) {
        dateRangeStr = `_${endDateStr}이전`;
      }
    } else if (searchParams?.uploadPeriod) {
      dateRangeStr = `_${searchParams.uploadPeriod}`;
    }
    
    const filename = `YouTube_${keyword}_${country}${dateRangeStr}_[${resultCount}]_${timestamp}.xlsx`;

    // 응답 헤더 설정
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', excelBuffer.length);

    // Excel 파일 전송
    res.send(excelBuffer);

    console.log(`✅ Excel 파일 생성 완료: ${filename} (${searchResults.length}행, 수익 데이터 포함)`);

  } catch (error) {
    console.error('Excel 다운로드 오류:', error);
    res.status(500).json({ error: 'Excel 파일 생성에 실패했습니다.' });
  }
});

// Excel용 시간 포맷 함수
function formatDurationForExcel(durationSeconds) {
  if (!durationSeconds || durationSeconds === 0) {
    return '00:00';
  }
  
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Excel용 구독자 수 포맷 함수 (만 단위)
function formatSubscriberCountForExcel(count) {
  if (!count || count === 0) {
    return '0';
  }
  
  const number = parseInt(count);
  const inTenThousands = number / 10000;
  
  if (number < 10000) {
    // 1만 미만인 경우 소수점 2자리 표시
    return inTenThousands.toFixed(2);
  } else {
    // 1만 이상인 경우 소수점 1자리 표시 (100만 이상도 포함)
    return inTenThousands.toFixed(1);
  }
}

// Excel용 동영상 길이 카테고리 포맷 함수
function formatVideoLengthForExcel(category) {
  const categoryMap = {
    'short1': 'Short Form1 (1분 미만)',
    'short2': 'Short Form2 (1분 이상 2분 미만)',
    'mid1': 'Mid Form1 (2분 이상 10분 미만)',
    'mid2': 'Mid Form2 (10분 이상 20분 미만)',
    'long1': 'Long Form1 (20분 이상 30분 미만)',
    'long2': 'Long Form2 (30분 이상 40분 미만)',
    'long3': 'Long Form3 (40분 이상 50분 미만)',
    'long4': 'Long Form4 (50분 이상 60분 미만)',
    'long5': 'Long Form5 (60분 이상 90분 미만)',
    'long6': 'Long Form6 (90분 이상)'
  };
  
  return categoryMap[category] || category || '알 수 없음';
}

// 헬퍼 함수들
function getCountryCode(country) {
  // YouTube API가 공식 지원하는 regionCode 목록 (25개국 완전 지원)
  const countryMap = {
    'worldwide': null, // 전세계 검색 시 regionCode 없음
    'korea': 'KR',     // ✅ 한국 - 안정적
    'usa': 'US',       // ✅ 미국 - 안정적
    'japan': 'JP',     // ✅ 일본 - 안정적
    'china': 'CN',     // ✅ 중국 - 지원 추가
    'uk': 'GB',        // ✅ 영국 - 안정적
    'germany': 'DE',   // ✅ 독일 - 안정적
    'france': 'FR',    // ✅ 프랑스 - 안정적
    'canada': 'CA',    // ✅ 캐나다 - 안정적
    'australia': 'AU', // ✅ 호주 - 안정적
    'india': 'IN',     // ✅ 인도 - 안정적
    'brazil': 'BR',    // ✅ 브라질 - 안정적
    'mexico': 'MX',    // ✅ 멕시코 - 안정적
    'russia': 'RU',    // ✅ 러시아 - 지원 추가
    'italy': 'IT',     // ✅ 이탈리아 - 안정적
    'spain': 'ES',     // ✅ 스페인 - 안정적
    // 아시아-태평양 추가 국가들
    'thailand': 'TH',  // ✅ 태국 - 지원 추가
    'vietnam': 'VN',   // ✅ 베트남 - 지원 추가
    'indonesia': 'ID', // ✅ 인도네시아 - 지원 추가
    // 남미 추가 국가들
    'argentina': 'AR', // ✅ 아르헨티나 - 지원 추가
    'colombia': 'CO',  // ✅ 콜롬비아 - 지원 추가
    // 중동 & 아프리카 추가 국가들
    'saudi': 'SA',     // ✅ 사우디아라비아 - 지원 추가
    'uae': 'AE',       // ✅ UAE - 지원 추가
    'southafrica': 'ZA', // ✅ 남아프리카공화국 - 지원 추가
    'nigeria': 'NG',   // ✅ 나이지리아 - 지원 추가
    'egypt': 'EG'      // ✅ 이집트 - 지원 추가
  };
  
  const code = countryMap[country.toLowerCase()];
  
  // 유효한 regionCode인지 확인 (YouTube API 지원 국가만)
  const validRegionCodes = [
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT',
    'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI',
    'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY',
    'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
    'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
    'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK',
    'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL',
    'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
    'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
    'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
    'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS',
    'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
    'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
    'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
    'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
    'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
    'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
    'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF',
    'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
    'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
    'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
  ];
  
  // 유효한 코드만 반환, 그렇지 않으면 null
  return code && validRegionCodes.includes(code) ? code : null;
}

function getLanguageCode(country) {
  const languageMap = {
    'worldwide': 'en', // 전세계는 영어 기본
    'korea': 'ko',     // 한국어
    'usa': 'en',       // 영어
    'japan': 'ja',     // 일본어
    'china': 'zh',     // 중국어 (YouTube 접근 제한 고려)
    'uk': 'en',        // 영어
    'germany': 'de',   // 독일어
    'france': 'fr',    // 프랑스어
    'canada': 'en',    // 영어 (캐나다는 영어/프랑스어 혼용이지만 영어 우선)
    'australia': 'en', // 영어
    'india': 'en',     // 영어 (힌디어 등 여러 언어 있지만 영어 우선)
    'brazil': 'pt',    // 포르투갈어
    'mexico': 'es',    // 스페인어
    'russia': 'en',    // 러시아는 서비스 제한으로 영어 사용
    'italy': 'it',     // 이탈리아어
    'spain': 'es'      // 스페인어
  };
  
  return languageMap[country.toLowerCase()] || 'en';
}

function getDateRange(period) {
  const now = new Date();
  let publishedAfter = null;
  
  console.log(`업로드 기간 설정: ${period}`);
  
  switch (period) {
    case '1day':
      publishedAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '2days':
      publishedAfter = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      break;
    case '3days':
      publishedAfter = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      break;
    case '1week':
      publishedAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '2weeks':
      publishedAfter = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      break;
    case '3weeks':
      publishedAfter = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
      break;
    case '1month':
      publishedAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '3months':
      publishedAfter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '6months':
      publishedAfter = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      break;
    case '1year':
      publishedAfter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case '2years':
      publishedAfter = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '3years':
      publishedAfter = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '4years':
      publishedAfter = new Date(now.getTime() - 4 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '5years':
      publishedAfter = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '6years':
      publishedAfter = new Date(now.getTime() - 6 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '7years':
      publishedAfter = new Date(now.getTime() - 7 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '8years':
      publishedAfter = new Date(now.getTime() - 8 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '9years':
      publishedAfter = new Date(now.getTime() - 9 * 365 * 24 * 60 * 60 * 1000);
      break;
    case '10years':
      publishedAfter = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
      break;
  }
  
  const result = {
    publishedAfter: publishedAfter ? publishedAfter.toISOString() : null,
    publishedBefore: null
  };
  
  if (publishedAfter) {
    console.log(`업로드 기간 필터링 적용됨: ${publishedAfter.toISOString()} 이후`);
  }
  
  return result;
}

// YouTube duration (ISO 8601)을 초로 변환하는 함수
function parseDuration(duration) {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);
  
  if (!matches) return 0;
  
  const hours = parseInt(matches[1]) || 0;
  const minutes = parseInt(matches[2]) || 0;
  const seconds = parseInt(matches[3]) || 0;
  
  return hours * 3600 + minutes * 60 + seconds;
}

// 동영상 길이 분류 함수
function getVideoLengthCategory(durationInSeconds) {
  if (durationInSeconds < 60) return 'short1';       // 1분 미만
  if (durationInSeconds < 120) return 'short2';      // 1분 이상 2분 미만
  if (durationInSeconds < 600) return 'mid1';        // 2분 이상 10분 미만
  if (durationInSeconds < 1200) return 'mid2';       // 10분 이상 20분 미만
  if (durationInSeconds < 1800) return 'long1';      // 20분 이상 30분 미만
  if (durationInSeconds < 2400) return 'long2';      // 30분 이상 40분 미만
  if (durationInSeconds < 3000) return 'long3';      // 40분 이상 50분 미만
  if (durationInSeconds < 3600) return 'long4';      // 50분 이상 60분 미만
  if (durationInSeconds < 5400) return 'long5';      // 60분 이상 90분 미만
  return 'long6';                                    // 90분 이상
}

// 선택된 길이 카테고리와 매치되는지 확인
function matchesVideoLength(videoLengthCategory, selectedLengths) {
  if (!selectedLengths || selectedLengths.length === 0) return true;
  return selectedLengths.includes(videoLengthCategory);
}

// 채널 개설일 가져오기 (새 기능)
async function getChannelCreatedDate(channelId) {
  try {
    const youtubeInstance = apiKeyManager.getYouTubeInstance();
    const currentKey = youtubeInstance.currentKey;
    const channelResponse = await youtubeInstance.youtube.channels.list({
      part: 'snippet',
      id: channelId
    });

    if (channelResponse.data.items && channelResponse.data.items.length > 0) {
      const publishedAt = channelResponse.data.items[0].snippet.publishedAt;
      return publishedAt;
    }
    
    return null;
  } catch (error) {
    console.error(`채널 개설일 조회 오류 (${channelId}):`, error.message);
    return null;
  }
}

// 채널 설명 가져오기 (Excel용)
async function getChannelDescription(channelId) {
  try {
    const youtubeInstance = apiKeyManager.getYouTubeInstance();
    const currentKey = youtubeInstance.currentKey;
    const channelResponse = await youtubeInstance.youtube.channels.list({
      part: 'snippet',
      id: channelId
    });

    if (channelResponse.data.items && channelResponse.data.items.length > 0) {
      const description = channelResponse.data.items[0].snippet.description;
      return description || '';
    }
    
    return '';
  } catch (error) {
    console.error(`채널 설명 조회 오류 (${channelId}):`, error.message);
    return '';
  }
}

// 무료 RPM 추정 로직
function calculateFreeRPM(videoData) {
  try {
    // 1. 기본 국가별 RPM 테이블 (USD 기준)
    const baseRPM = {
      'US': 3.5, 'KR': 2.8, 'JP': 3.2, 'DE': 3.0, 'GB': 3.8,
      'CA': 3.3, 'AU': 3.6, 'FR': 2.9, 'IT': 2.4, 'ES': 2.1,
      'NL': 3.1, 'SE': 3.4, 'NO': 4.2, 'DK': 3.3, 'FI': 3.0,
      'BR': 1.8, 'MX': 1.9, 'AR': 1.5, 'IN': 1.2, 'ID': 1.1,
      'TH': 1.4, 'VN': 1.0, 'PH': 1.3, 'MY': 1.6, 'SG': 2.8,
      'worldwide': 2.5 // 전세계 평균
    };

    // 2. 카테고리별 배율 (Phase 2 세분화)
    const categoryMultiplier = {
      // 고수익 카테고리
      'Finance': 1.8, 'Business': 1.6, 'News & Politics': 1.5, 'Science & Technology': 1.4, 'Education': 1.3,
      // 중수익 카테고리  
      'Autos & Vehicles': 1.2, 'Travel & Events': 1.1, 'Howto & Style': 1.0, 'Sports': 1.0,
      // 중하위 수익 카테고리
      'People & Blogs': 0.9, 'Gaming': 0.9, 'Pets & Animals': 0.9,
      // 저수익 카테고리
      'Entertainment': 0.8, 'Film & Animation': 0.8, 'Comedy': 0.8, 'Music': 0.7, 'Nonprofits & Activism': 0.7,
      // 세부 카테고리 추가 (Phase 2)
      'Tech Reviews': 1.6, 'Crypto & Investment': 2.0, 'Real Estate': 1.7, 'Insurance': 1.9,
      'Online Learning': 1.4, 'Programming Tutorial': 1.5, 'Medical & Health': 1.3,
      'Luxury Cars': 1.4, 'Electric Vehicles': 1.3, 'Travel Vlog': 1.0, 'Food & Cooking': 0.95,
      'Beauty & Makeup': 1.1, 'Fashion': 1.0, 'Fitness': 1.1, 'Lifestyle': 0.9,
      'ASMR': 0.6, 'Kids Content': 0.5, 'Music Cover': 0.6, 'Dance': 0.7,
      'Movie Reviews': 0.9, 'TV Shows': 0.8, 'Celebrity News': 0.8,
      'Esports': 1.1, 'Mobile Games': 0.8, 'PC Games': 0.9, 'Console Games': 0.85
    };

    // 3. 기본 RPM 계산
    const country = videoData.country || 'worldwide';
    const category = videoData.primary_category || 'Entertainment';
    let rpm = baseRPM[country] || baseRPM['worldwide'];
    rpm *= categoryMultiplier[category] || 1.0;

    // 4. 조회수 기반 가중치
    const views = parseInt(videoData.daily_view_count) || 0;
    let viewMultiplier = 1.0;
    if (views < 10000) viewMultiplier = 0.7;          // 마이크로
    else if (views < 100000) viewMultiplier = 0.85;   // 스몰
    else if (views < 1000000) viewMultiplier = 1.0;   // 미디엄
    else if (views < 10000000) viewMultiplier = 1.15; // 라지
    else viewMultiplier = 1.3;                        // 휴지

    // 4-1. 시청 시간 가중치 (Phase 1)
    const durationSeconds = parseInt(videoData.duration_seconds) || 0;
    let durationMultiplier = 1.0;
    if (durationSeconds < 60) durationMultiplier = 0.8;        // Shorts (낮은 RPM)
    else if (durationSeconds < 300) durationMultiplier = 1.0;  // 5분 미만 (표준)
    else if (durationSeconds < 600) durationMultiplier = 1.15; // 5-10분 (최적)
    else if (durationSeconds < 1200) durationMultiplier = 1.25; // 10-20분 (높은 RPM)
    else durationMultiplier = 1.1;                             // 20분 이상 (약간 감소)

    // 5. 채널 성숙도 (채널 생성일 기반)
    let ageMultiplier = 1.0;
    if (videoData.channel_created_date) {
      const channelAge = (Date.now() - new Date(videoData.channel_created_date)) / (365 * 24 * 60 * 60 * 1000);
      ageMultiplier = Math.min(1.2, 0.8 + (channelAge * 0.1));
    }

    // 5-1. 구독자 비율 분석 (Phase 1)
    const subscriberCount = parseInt(videoData.subscriber_count) || 0;
    let subscriberMultiplier = 1.0;
    if (views > 0 && subscriberCount > 0) {
      const viewToSubscriberRatio = views / subscriberCount;
      if (viewToSubscriberRatio < 0.1) subscriberMultiplier = 0.85;       // 낮은 도달률
      else if (viewToSubscriberRatio < 0.5) subscriberMultiplier = 1.0;   // 표준 도달률
      else if (viewToSubscriberRatio < 2.0) subscriberMultiplier = 1.15;  // 높은 도달률
      else if (viewToSubscriberRatio < 10.0) subscriberMultiplier = 1.3;  // 바이럴 콘텐츠
      else subscriberMultiplier = 1.45;                                   // 슈퍼 바이럴
    }

    // 5-2. 계절성 패턴 반영 (Phase 1)
    let seasonalMultiplier = 1.0;
    if (videoData.status_date) {
      const uploadDate = new Date(videoData.status_date);
      const month = uploadDate.getMonth() + 1; // 1-12월
      
      // Q4 (10-12월): 광고비 최고 시즌
      if (month >= 10 && month <= 12) seasonalMultiplier = 1.25;
      // Q1 (1-3월): 광고비 높음
      else if (month >= 1 && month <= 3) seasonalMultiplier = 1.15;
      // Q2 (4-6월): 표준
      else if (month >= 4 && month <= 6) seasonalMultiplier = 1.0;
      // Q3 (7-9월): 여름 광고비 감소
      else seasonalMultiplier = 0.9;
    }

    // 6. 참여도 점수 (좋아요 기반 추정)
    let engagementMultiplier = 1.0;
    if (videoData.actual_like_count) {
      const engagementRate = videoData.actual_like_count / views;
      engagementMultiplier = 0.8 + Math.min(0.4, engagementRate * 100);
    }

    // 7. 최종 RPM 계산 (Phase 1 & 2 모든 요소 포함)
    const finalRPM = rpm * viewMultiplier * durationMultiplier * ageMultiplier * 
                     subscriberMultiplier * seasonalMultiplier * engagementMultiplier;
    
    return Math.round(finalRPM * 100) / 100; // 소수점 2자리로 반올림
  } catch (error) {
    console.log('RPM 계산 오류:', error.message);
    return 2.5; // 기본값 반환
  }
}

// Analytics 추정 데이터 계산 함수들
function calculateEstimatedAnalytics(videoData) {
  try {
    const estimatedRPM = calculateFreeRPM(videoData);
    const views = parseInt(videoData.daily_view_count) || 0;
    const duration = parseInt(videoData.duration_seconds) || 0;
    const subscriberCount = parseInt(videoData.subscriber_count) || 0;
    
    return {
      views: views, // 실제 조회수 (공개 데이터)
      estimatedMinutesWatched: calculateEstimatedWatchTime(views, duration, videoData),
      averageViewDuration: calculateAverageViewDuration(duration, videoData),
      subscribersGained: calculateSubscribersGained(views, subscriberCount, videoData),
      adImpressions: calculateAdImpressions(views, videoData),
      estimatedRevenue: Math.round((views * estimatedRPM / 1000) * 100) / 100,
      estimatedAdRevenue: Math.round((views * estimatedRPM / 1000) * 0.85 * 100) / 100,
      estimatedRedPartnerRevenue: Math.round((views * estimatedRPM / 1000) * 0.15 * 100) / 100,
      playbackBasedCpm: calculatePlaybackCPM(estimatedRPM, videoData),
      adCpm: calculateAdCPM(estimatedRPM, videoData)
    };
  } catch (error) {
    console.log('Analytics 추정 계산 오류:', error.message);
    return {
      views: 0, estimatedMinutesWatched: 0, averageViewDuration: 0,
      subscribersGained: 0, adImpressions: 0, estimatedRevenue: 0,
      estimatedAdRevenue: 0, estimatedRedPartnerRevenue: 0,
      playbackBasedCpm: 0, adCpm: 0
    };
  }
}

// 추정 시청 시간 계산 (분 단위)
function calculateEstimatedWatchTime(views, duration, videoData) {
  try {
    const avgViewDuration = calculateAverageViewDuration(duration, videoData);
    const totalWatchSeconds = views * avgViewDuration;
    return Math.round(totalWatchSeconds / 60); // 분 단위로 변환
  } catch (error) {
    return 0;
  }
}

// 평균 시청 시간 계산 (초 단위)
function calculateAverageViewDuration(duration, videoData) {
  try {
    const category = videoData.primary_category || 'Entertainment';
    
    // 카테고리별 완시청률 패턴
    const retentionRates = {
      'Finance': 0.65, 'Business': 0.60, 'News & Politics': 0.55,
      'Science & Technology': 0.58, 'Education': 0.62, 'Howto & Style': 0.52,
      'Gaming': 0.48, 'Entertainment': 0.45, 'Music': 0.35,
      'Comedy': 0.42, 'Sports': 0.50, 'ASMR': 0.70, 'Kids Content': 0.40
    };
    
    // 동영상 길이별 완시청률 조정
    let durationMultiplier = 1.0;
    if (duration < 60) durationMultiplier = 0.9;        // Shorts
    else if (duration < 300) durationMultiplier = 1.0;  // 5분 미만
    else if (duration < 600) durationMultiplier = 0.85; // 5-10분
    else if (duration < 1200) durationMultiplier = 0.7; // 10-20분
    else durationMultiplier = 0.6;                      // 20분 이상
    
    const baseRetention = retentionRates[category] || 0.45;
    const finalRetention = baseRetention * durationMultiplier;
    
    return Math.round(duration * finalRetention);
  } catch (error) {
    return Math.round(duration * 0.45); // 기본 45% 완시청률
  }
}

// 신규 구독자 수 추정
function calculateSubscribersGained(views, subscriberCount, videoData) {
  try {
    const category = videoData.primary_category || 'Entertainment';
    
    // 카테고리별 구독 전환율
    const conversionRates = {
      'Education': 0.008, 'Howto & Style': 0.007, 'Science & Technology': 0.006,
      'Finance': 0.005, 'Business': 0.005, 'Gaming': 0.004,
      'Entertainment': 0.003, 'Music': 0.002, 'Comedy': 0.003,
      'ASMR': 0.009, 'Kids Content': 0.001
    };
    
    // 채널 크기별 구독 전환율 조정
    let sizeMultiplier = 1.0;
    if (subscriberCount < 1000) sizeMultiplier = 1.5;      // 소형 채널
    else if (subscriberCount < 10000) sizeMultiplier = 1.2; // 중소형 채널
    else if (subscriberCount < 100000) sizeMultiplier = 1.0; // 중형 채널
    else if (subscriberCount < 1000000) sizeMultiplier = 0.8; // 대형 채널
    else sizeMultiplier = 0.6;                              // 메가 채널
    
    const baseConversion = conversionRates[category] || 0.003;
    const finalConversion = baseConversion * sizeMultiplier;
    
    return Math.round(views * finalConversion);
  } catch (error) {
    return Math.round(views * 0.003); // 기본 0.3% 전환율
  }
}

// 광고 노출 수 추정
function calculateAdImpressions(views, videoData) {
  try {
    const category = videoData.primary_category || 'Entertainment';
    const duration = parseInt(videoData.duration_seconds) || 0;
    
    // 카테고리별 광고 노출률
    const adRates = {
      'Finance': 0.95, 'Business': 0.92, 'News & Politics': 0.90,
      'Science & Technology': 0.88, 'Education': 0.85, 'Howto & Style': 0.82,
      'Gaming': 0.75, 'Entertainment': 0.80, 'Music': 0.70,
      'Comedy': 0.78, 'ASMR': 0.60, 'Kids Content': 0.40
    };
    
    // 동영상 길이별 광고 개수
    let adsPerView = 1.0;
    if (duration < 60) adsPerView = 0.8;        // Shorts
    else if (duration < 300) adsPerView = 1.0;  // 5분 미만
    else if (duration < 600) adsPerView = 1.5;  // 5-10분
    else if (duration < 1200) adsPerView = 2.0; // 10-20분
    else adsPerView = 2.5;                      // 20분 이상
    
    const adRate = adRates[category] || 0.80;
    const totalAds = views * adRate * adsPerView;
    
    return Math.round(totalAds);
  } catch (error) {
    return Math.round(views * 0.80); // 기본 80% 광고 노출률
  }
}

// 재생 기반 CPM 계산
function calculatePlaybackCPM(estimatedRPM, videoData) {
  try {
    const duration = parseInt(videoData.duration_seconds) || 0;
    
    // 재생 시간별 CPM 배율 (CPM이 RPM보다 높아야 함)
    let playbackMultiplier = 1.35; // 기본 35% 높음
    if (duration < 60) playbackMultiplier = 1.25;       // Shorts
    else if (duration < 300) playbackMultiplier = 1.35; // 5분 미만
    else if (duration < 600) playbackMultiplier = 1.45; // 5-10분
    else if (duration < 1200) playbackMultiplier = 1.55; // 10-20분
    else playbackMultiplier = 1.6;                      // 20분 이상
    
    const playbackCPM = estimatedRPM * playbackMultiplier;
    return Math.round(playbackCPM * 100) / 100;
  } catch (error) {
    return (estimatedRPM || 2.5) * 1.35;
  }
}

// 광고 CPM 계산
function calculateAdCPM(estimatedRPM, videoData) {
  try {
    const category = videoData.primary_category || 'Entertainment';
    
    // 카테고리별 광고 CPM 배율 (CPM이 RPM보다 높아야 함)
    const adMultipliers = {
      'Finance': 2.1, 'Business': 1.9, 'Insurance': 2.3,
      'Real Estate': 2.0, 'Crypto & Investment': 2.2,
      'Science & Technology': 1.7, 'Education': 1.6,
      'Gaming': 1.4, 'Entertainment': 1.5, 'Music': 1.3,
      'ASMR': 1.2, 'Kids Content': 1.1
    };
    
    const adMultiplier = adMultipliers[category] || 1.5;
    const adCPM = estimatedRPM * adMultiplier;
    
    return Math.round(adCPM * 100) / 100;
  } catch (error) {
    return (estimatedRPM || 2.5) * 1.5;
  }
}

// 채널 구독자 수 가져오기
async function getChannelSubscriberCount(channelId) {
  try {
    const youtubeInstance = apiKeyManager.getYouTubeInstance();
    const currentKey = youtubeInstance.currentKey;
    const channelResponse = await youtubeInstance.youtube.channels.list({
      part: 'statistics',
      id: channelId
    });

    if (channelResponse.data.items && channelResponse.data.items.length > 0) {
      const subscriberCount = channelResponse.data.items[0].statistics.subscriberCount;
      return parseInt(subscriberCount) || 0;
    }
    
    return 0;
  } catch (error) {
    console.error(`채널 구독자 수 조회 오류 (${channelId}):`, error.message);
    return 0;
  }
}

// Excel 포맷 헬퍼 함수들
function formatSubscriberCountForExcel(count) {
  const num = parseInt(count) || 0;
  if (num >= 1000000) {
    return Math.round(num / 100000) / 10 + 'M';
  } else if (num >= 1000) {
    return Math.round(num / 100) / 10 + 'K';
  }
  return num.toLocaleString();
}

function formatDurationForExcel(seconds) {
  const sec = parseInt(seconds) || 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSeconds = sec % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

function formatVideoLengthForExcel(category) {
  const categoryMap = {
    'short1': '1분 미만',
    'short2': '1-2분',
    'mid1': '2-10분',
    'mid2': '10-20분',
    'long1': '20-30분',
    'long2': '30-40분',
    'long3': '40-50분',
    'long4': '50-60분',
    'long5': '60-90분',
    'long6': '90분 이상'
  };
  return categoryMap[category] || '기타';
}

async function getCategoryName(categoryId) {
  try {
    const categories = {
      '1': 'Film & Animation',
      '2': 'Autos & Vehicles',
      '10': 'Music',
      '15': 'Pets & Animals',
      '17': 'Sports',
      '19': 'Travel & Events',
      '20': 'Gaming',
      '22': 'People & Blogs',
      '23': 'Comedy',
      '24': 'Entertainment',
      '25': 'News & Politics',
      '26': 'Howto & Style',
      '27': 'Education',
      '28': 'Science & Technology',
      '29': 'Nonprofits & Activism'
    };
    
    return categories[categoryId] || 'Other';
  } catch (error) {
    return 'Other';
  }
}

// 안전한 파일명 생성 함수 (한글 보존)
function createSafeFilename(filename) {
  if (!filename) return 'thumbnail.jpg';
  
  let safe = filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // 위험한 문자만 제거
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100);
    
  // 파일명이 비어있거나 너무 짧으면 기본값
  if (safe.length < 3) safe = 'thumbnail';
  
  if (!safe.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
    safe += '.jpg';
  }
  
  return safe;
}

// 썸네일 다운로드 API (ERR_INVALID_CHAR 오류 해결)
app.get('/api/download-thumbnail', async (req, res) => {
  try {
    const { url, filename } = req.query;

    console.log('📥 썸네일 다운로드 요청:', { url, filename });

    if (!url) {
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    // 안전한 파일명 생성
    const safeFilename = createSafeFilename(filename);
    console.log('🔧 안전한 파일명 생성:', { original: filename, safe: safeFilename });

    const response = await axios.get(url, { 
      responseType: 'stream',
      timeout: 10000  // 10초 타임아웃
    });
    
    // 안전한 파일명만 헤더에 설정
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Content-Length', response.headers['content-length'] || '');
    
    response.data.pipe(res);

    console.log(`✅ 썸네일 다운로드 성공: ${safeFilename}`);

  } catch (error) {
    console.error('썸네일 다운로드 오류:', error);
    
    // 구체적인 오류 처리
    if (error.code === 'ERR_INVALID_CHAR') {
      console.error('❌ Content-Disposition 헤더 오류:', {
        originalFilename: req.query.filename,
        url: req.query.url,
        error: error.message
      });
      res.status(400).json({ 
        error: '파일명에 사용할 수 없는 문자가 포함되어 있습니다.',
        details: 'Invalid characters in filename for HTTP header'
      });
    } else if (error.response) {
      console.error('❌ 외부 서버 오류:', error.response.status, error.response.statusText);
      res.status(502).json({ 
        error: '썸네일 서버에서 이미지를 가져올 수 없습니다.',
        details: `HTTP ${error.response.status}: ${error.response.statusText}`
      });
    } else if (error.request) {
      console.error('❌ 네트워크 오류:', error.message);
      res.status(503).json({ 
        error: '네트워크 오류로 썸네일 다운로드에 실패했습니다.',
        details: 'Network timeout or connection error'
      });
    } else {
      console.error('❌ 알 수 없는 오류:', error.message);
      res.status(500).json({ 
        error: '썸네일 다운로드에 실패했습니다.',
        details: error.message
      });
    }
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`브라우저에서 http://localhost:${PORT} 를 열어주세요.`);
});