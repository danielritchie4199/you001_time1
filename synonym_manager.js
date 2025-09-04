// 동의어 관리 모듈
class SynonymManager {
  constructor() {
    // 기본 동의어 매핑
    this.synonymMapping = new Map([
      // 음악 관련
      ['음악', ['뮤직', 'music', '노래', 'song', '곡']],
      ['뮤직', ['음악', 'music', '노래', 'song', '곡']],
      ['music', ['음악', '뮤직', '노래', 'song', '곡']],
      
      // 요리 관련
      ['요리', ['쿠킹', 'cooking', '레시피', 'recipe']],
      ['쿠킹', ['요리', 'cooking', '레시피', 'recipe']],
      ['cooking', ['요리', '쿠킹', '레시피', 'recipe']],
      
      // 게임 관련
      ['게임', ['게이밍', 'gaming', '플레이', 'game']],
      ['게이밍', ['게임', 'gaming', '플레이', 'game']],
      ['gaming', ['게임', '게이밍', '플레이', 'game']],
      
      // 뷰티 관련
      ['뷰티', ['미용', 'beauty', '화장', '메이크업', 'makeup']],
      ['미용', ['뷰티', 'beauty', '화장', '메이크업', 'makeup']],
      ['beauty', ['뷰티', '미용', '화장', '메이크업', 'makeup']],
      
      // 운동 관련
      ['운동', ['스포츠', 'sports', '헬스', 'fitness', 'workout']],
      ['스포츠', ['운동', 'sports', '헬스', 'fitness', 'workout']],
      ['헬스', ['운동', 'sports', '스포츠', 'fitness', 'workout']],
      
      // 여행 관련
      ['여행', ['트래블', 'travel', '여행기', 'trip']],
      ['트래블', ['여행', 'travel', '여행기', 'trip']],
      ['travel', ['여행', '트래블', '여행기', 'trip']],
      
      // 리뷰 관련
      ['리뷰', ['후기', 'review', '평가', '평점']],
      ['후기', ['리뷰', 'review', '평가', '평점']],
      ['review', ['리뷰', '후기', '평가', '평점']],
      
      // 먹방 관련
      ['먹방', ['eating', 'food', '음식', 'mukbang']],
      ['eating', ['먹방', 'food', '음식', 'mukbang']],
      ['food', ['먹방', 'eating', '음식', 'mukbang']],
      
      // 댄스 관련
      ['댄스', ['춤', 'dance', '안무', 'choreography']],
      ['춤', ['댄스', 'dance', '안무', 'choreography']],
      ['dance', ['댄스', '춤', '안무', 'choreography']],
      
      // 코미디 관련
      ['코미디', ['개그', 'comedy', '웃긴', 'funny']],
      ['개그', ['코미디', 'comedy', '웃긴', 'funny']],
      ['comedy', ['코미디', '개그', '웃긴', 'funny']],
      
      // 드라마 관련
      ['드라마', ['시리즈', 'series', '연속극', 'drama']],
      ['시리즈', ['드라마', 'series', '연속극', 'drama']],
      ['series', ['드라마', '시리즈', '연속극', 'drama']],
      
      // 영화 관련
      ['영화', ['movie', 'film', '시네마', 'cinema']],
      ['movie', ['영화', 'film', '시네마', 'cinema']],
      ['film', ['영화', 'movie', '시네마', 'cinema']],
      
      // 애니메이션 관련
      ['애니메이션', ['애니', 'anime', '만화', 'animation']],
      ['애니', ['애니메이션', 'anime', '만화', 'animation']],
      ['anime', ['애니메이션', '애니', '만화', 'animation']],
      
      // 교육 관련
      ['교육', ['학습', 'education', '강의', 'lecture']],
      ['학습', ['교육', 'education', '강의', 'lecture']],
      ['강의', ['교육', '학습', 'education', 'lecture']],
      
      // 뉴스 관련
      ['뉴스', ['소식', 'news', '정보', 'information']],
      ['소식', ['뉴스', 'news', '정보', 'information']],
      ['news', ['뉴스', '소식', '정보', 'information']],
      
      // K-Pop 관련
      ['케이팝', ['kpop', 'k-pop', '한국음악', 'korean music']],
      ['kpop', ['케이팝', 'k-pop', '한국음악', 'korean music']],
      ['k-pop', ['케이팝', 'kpop', '한국음악', 'korean music']]
    ]);
  }
  
  // 동의어 확장
  expandSynonyms(keyword) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    const synonyms = this.synonymMapping.get(normalizedKeyword) || [];
    return [normalizedKeyword, ...synonyms];
  }
  
  // 검색 키워드 확장 (클라이언트 사이드용)
  expandSearchKeywords(keywords) {
    const expandedKeywords = new Set();
    
    keywords.forEach(keyword => {
      const synonyms = this.expandSynonyms(keyword);
      synonyms.forEach(synonym => expandedKeywords.add(synonym));
    });
    
    return Array.from(expandedKeywords);
  }
  
  // 동의어 추가
  addSynonym(keyword, synonyms) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    const normalizedSynonyms = synonyms.map(s => s.toLowerCase().trim());
    
    // 양방향 매핑 추가
    this.synonymMapping.set(normalizedKeyword, normalizedSynonyms);
    
    normalizedSynonyms.forEach(synonym => {
      const existing = this.synonymMapping.get(synonym) || [];
      if (!existing.includes(normalizedKeyword)) {
        existing.push(normalizedKeyword);
        this.synonymMapping.set(synonym, existing);
      }
    });
  }
  
  // 동의어 제거
  removeSynonym(keyword) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    const synonyms = this.synonymMapping.get(normalizedKeyword) || [];
    
    // 양방향 매핑 제거
    synonyms.forEach(synonym => {
      const synonymList = this.synonymMapping.get(synonym) || [];
      const updatedList = synonymList.filter(s => s !== normalizedKeyword);
      if (updatedList.length > 0) {
        this.synonymMapping.set(synonym, updatedList);
      } else {
        this.synonymMapping.delete(synonym);
      }
    });
    
    this.synonymMapping.delete(normalizedKeyword);
  }
  
  // 모든 동의어 조회
  getAllSynonyms() {
    const result = {};
    this.synonymMapping.forEach((synonyms, keyword) => {
      result[keyword] = synonyms;
    });
    return result;
  }
  
  // 검색 제안 생성
  getSuggestionsForKeyword(keyword) {
    const synonyms = this.expandSynonyms(keyword);
    return synonyms.map(synonym => ({
      text: synonym,
      type: synonym === keyword.toLowerCase() ? 'original' : 'synonym',
      boost: synonym === keyword.toLowerCase() ? 1.0 : 0.8
    }));
  }
}

module.exports = SynonymManager;