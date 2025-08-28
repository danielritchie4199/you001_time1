const express = require('express');
const cors = require('cors');
const path = require('path');

console.log('🚀 서버 테스트 시작...');

// Express 앱 초기화
const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 기본 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'you_list.html'));
});

// 테스트 API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '서버가 정상 작동합니다!',
    timestamp: new Date().toISOString()
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`✅ 테스트 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`🌐 브라우저에서 http://localhost:${PORT} 를 열어주세요.`);
  console.log(`🧪 테스트 API: http://localhost:${PORT}/api/test`);
});

// 프로세스 종료 처리
process.on('SIGINT', () => {
  console.log('\n👋 서버를 종료합니다...');
  process.exit(0);
});

console.log('🔧 서버 설정 완료, 포트 대기 중...');
