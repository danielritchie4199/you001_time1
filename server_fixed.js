const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const axios = require('axios');
const XLSX = require('xlsx');
const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

// Express 앱 초기화
const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Elasticsearch 클라이언트 설정
let esClient = null;
try {
  esClient = new Client({ node: process.env.ES_NODE || 'http://localhost:9200' });
  console.log('Elasticsearch 클라이언트 초기화 완료');
} catch (error) {
  console.warn('Elasticsearch 연결 실패, YouTube API만 사용:', error.message);
  esClient = null;
}

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

// 메인 페이지 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'you_list.html'));
});

// 간단한 테스트 API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '서버가 정상적으로 실행되고 있습니다.',
    timestamp: new Date().toISOString()
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`브라우저에서 http://localhost:${PORT} 를 열어주세요.`);
});
