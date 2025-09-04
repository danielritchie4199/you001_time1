// 동의어 기능 업데이트 스크립트
const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
require('dotenv').config();

const client = new Client({ 
  node: process.env.ES_NODE || 'http://localhost:9200' 
});

const INDEX_NAME = 'youtube_videos';

async function updateSynonyms() {
  try {
    console.log('🔄 동의어 기능 업데이트 시작...');
    
    // 1. 기존 인덱스 백업 및 삭제
    console.log('📂 기존 인덱스 확인 중...');
    const indexExists = await client.indices.exists({ index: INDEX_NAME });
    
    if (indexExists.body || indexExists) {
      console.log('🗂️ 기존 인덱스 발견, 백업 인덱스 생성...');
      
      // 기존 데이터를 백업 인덱스로 복사
      const backupIndexName = `${INDEX_NAME}_backup_${new Date().toISOString().split('T')[0]}`;
      
      await client.reindex({
        body: {
          source: { index: INDEX_NAME },
          dest: { index: backupIndexName }
        }
      });
      
      console.log(`✅ 백업 완료: ${backupIndexName}`);
      
      // 기존 인덱스 삭제
      await client.indices.delete({ index: INDEX_NAME });
      console.log('🗑️ 기존 인덱스 삭제 완료');
    }
    
    // 2. 새로운 매핑으로 인덱스 생성
    console.log('🔧 동의어 기능이 포함된 새 인덱스 생성 중...');
    
    const mappingConfig = JSON.parse(
      fs.readFileSync('./videos_mapping_with_synonyms.json', 'utf8')
    );
    
    await client.indices.create({
      index: INDEX_NAME,
      body: mappingConfig
    });
    
    console.log('✅ 동의어 기능이 포함된 새 인덱스 생성 완료');
    
    // 3. 백업 데이터가 있다면 복원
    if (indexExists.body || indexExists) {
      console.log('📥 백업 데이터 복원 중...');
      const backupIndexName = `${INDEX_NAME}_backup_${new Date().toISOString().split('T')[0]}`;
      
      await client.reindex({
        body: {
          source: { index: backupIndexName },
          dest: { index: INDEX_NAME }
        }
      });
      
      console.log('✅ 백업 데이터 복원 완료');
      
      // 백업 인덱스 삭제 (선택사항)
      // await client.indices.delete({ index: backupIndexName });
      // console.log('🗑️ 백업 인덱스 정리 완료');
    }
    
    // 4. 동의어 분석기 테스트
    console.log('🧪 동의어 분석기 테스트 중...');
    
    const testTerms = ['음악', '뮤직', '요리', '쿠킹'];
    
    for (const term of testTerms) {
      const response = await client.indices.analyze({
        index: INDEX_NAME,
        body: {
          analyzer: 'search_analyzer',
          text: term
        }
      });
      
      const tokens = response.body?.tokens || response.tokens || [];
      console.log(`📝 "${term}" 분석 결과:`, tokens.map(t => t.token).join(', '));
    }
    
    console.log('🎉 동의어 기능 업데이트 완료!');
    console.log('');
    console.log('✨ 이제 다음과 같은 동의어 검색이 가능합니다:');
    console.log('   - "음악" 검색 시 → "뮤직", "music", "노래" 포함 결과');
    console.log('   - "요리" 검색 시 → "쿠킹", "cooking", "레시피" 포함 결과');
    console.log('   - "게임" 검색 시 → "게이밍", "gaming", "플레이" 포함 결과');
    
  } catch (error) {
    console.error('❌ 동의어 업데이트 실패:', error);
    throw error;
  }
}

// 스크립트 실행
if (require.main === module) {
  updateSynonyms()
    .then(() => {
      console.log('업데이트 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('업데이트 실패:', error);
      process.exit(1);
    });
}

module.exports = { updateSynonyms };