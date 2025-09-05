let searchResults = [];
        let currentPage = 1;
        let itemsPerPage = 30;
        let sortColumn = 'daily_view_count';
        let sortDirection = 'desc';
        
        // 4단계 토글 상태 변수들
        let viewCountSortState = -1;
        let subscriberSortState = -1;
        let likesSortState = -1;
        let countrySortState = -1;
        let rpmSortState = -1;
        let durationSortState = -1;

        // 헤더 검색 함수 (인기검색어 분석)
        function performHeaderSearch() {
            const count = document.getElementById('headerKeyword').value.trim();
            const countNum = parseInt(count);
            
            // 입력 검증
            if (!count || isNaN(countNum) || countNum < 10 || countNum > 1000) {
                alert('인기검색어 개수를 10~1000 사이의 숫자로 입력해주세요.');
                return;
            }
            
            // 모달창 표시 및 분석 시작
            showTrendingModal();
            fetchTrendingKeywords(countNum);
        }

        // 인기검색어 모달창 표시
        function showTrendingModal() {
            document.getElementById('trendingKeywordsModal').style.display = 'block';
            // 모달창 상태 초기화
            document.getElementById('trendingLoadingContainer').style.display = 'block';
            document.getElementById('trendingKeywordsContainer').style.display = 'none';
            document.getElementById('trendingApplyBtn').disabled = true;
            document.getElementById('selectedCount').textContent = '0';
            selectedKeywords.clear();
        }

        // 인기검색어 모달창 숨기기
        function hideTrendingModal() {
            document.getElementById('trendingKeywordsModal').style.display = 'none';
        }

        // 선택된 키워드 저장용 Set
        let selectedKeywords = new Set();

        // 인기검색어 데이터 가져오기
        async function fetchTrendingKeywords(count) {
            try {
                updateProgress('YouTube에서 인기 동영상 수집 중...', 10);
                
                const response = await fetch('/api/trending-keywords', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        count: count,
                        videoCount: count * 5  // 동영상은 키워드 개수의 5배
                    })
                });

                if (!response.ok) {
                    throw new Error(`서버 오류: ${response.status}`);
                }

                updateProgress('키워드 분석 중...', 70);

                const data = await response.json();
                
                updateProgress('결과 정리 중...', 90);
                
                // 분석 정보 업데이트
                document.getElementById('trendingAnalysisInfo').textContent = 
                    `${data.videoCount}개 동영상에서 ${data.keywords.length}개 키워드 추출 완료`;

                // 키워드 표시
                displayTrendingKeywords(data.keywords);
                
                updateProgress('완료!', 100);
                
                setTimeout(() => {
                    document.getElementById('trendingLoadingContainer').style.display = 'none';
                    document.getElementById('trendingKeywordsContainer').style.display = 'grid';
                }, 500);

            } catch (error) {
                console.error('인기검색어 분석 오류:', error);
                document.getElementById('trendingLoadingContainer').innerHTML = `
                    <div style="color: #f44336; padding: 20px;">
                        <h4>⚠️ 분석 중 오류가 발생했습니다</h4>
                        <p>${error.message}</p>
                        <p>잠시 후 다시 시도해주세요.</p>
                    </div>
                `;
            }
        }

        // 진행률 업데이트
        function updateProgress(message, percent) {
            document.getElementById('trendingProgress').textContent = `${message} (${percent}%)`;
        }

        // 키워드 표시
        function displayTrendingKeywords(keywords) {
            const container = document.getElementById('trendingKeywordsContainer');
            container.innerHTML = '';

            keywords.forEach((keyword, index) => {
                const keywordElement = document.createElement('div');
                keywordElement.className = 'trending-keyword-item';
                keywordElement.innerHTML = `
                    <span class="rank">${index + 1}</span>
                    <div>${keyword.word}</div>
                    <small>(${keyword.frequency}회)</small>
                `;
                
                keywordElement.addEventListener('click', () => {
                    toggleKeywordSelection(keywordElement, keyword.word);
                });
                
                container.appendChild(keywordElement);
            });
        }

        // 키워드 선택/해제 토글
        function toggleKeywordSelection(element, keyword) {
            if (element.classList.contains('selected')) {
                element.classList.remove('selected');
                selectedKeywords.delete(keyword);
            } else {
                element.classList.add('selected');
                selectedKeywords.add(keyword);
            }
            
            // 선택된 키워드 수 업데이트
            const count = selectedKeywords.size;
            document.getElementById('selectedCount').textContent = count;
            document.getElementById('trendingApplyBtn').disabled = count === 0;
        }

        // 선택된 키워드를 검색어 필드에 적용
        function applySelectedKeywords() {
            if (selectedKeywords.size === 0) {
                alert('선택된 키워드가 없습니다.');
                return;
            }

            const keywordArray = Array.from(selectedKeywords);
            const keywordString = keywordArray.join(' ');
            
            // 메인 검색 폼의 키워드 필드에 값 설정
            const mainKeywordField = document.getElementById('keyword');
            if (mainKeywordField) {
                mainKeywordField.value = keywordString;
            }
            
            // 모달창 닫기
            hideTrendingModal();
            
            // 성공 메시지
            alert(`${keywordArray.length}개의 키워드가 검색어 필드에 적용되었습니다: ${keywordString}`);
        }

        // 헤더 검색창에서 엔터키 이벤트 처리 및 모달창 이벤트 설정
        document.addEventListener('DOMContentLoaded', function() {
            const headerKeywordInput = document.getElementById('headerKeyword');
            if (headerKeywordInput) {
                headerKeywordInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        performHeaderSearch();
                    }
                });
            }

            // 모달창 외부 클릭시 닫기
            const modal = document.getElementById('trendingKeywordsModal');
            if (modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target.id === 'trendingKeywordsModal') {
                        hideTrendingModal();
                    }
                });
            }

            // ESC 키로 모달창 닫기
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    const modal = document.getElementById('trendingKeywordsModal');
                    if (modal && modal.style.display === 'block') {
                        hideTrendingModal();
                    }
                }
            });
        });

        // 검색 폼 제출 이벤트 (기존 코드 수정)
        document.getElementById('searchForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // 검색 키워드 저장
            const keyword = document.getElementById('keyword').value.trim();
            
            // 🔄 새로운 검색 시 시간대 필터 초기화
            resetTimezoneFiltersForNewSearch();
            
            // 기존 검색 로직이 있다면 그것을 호출하고,
            // 없다면 새로 구현한 performSearch 호출
            if (typeof window.originalPerformSearch === 'function') {
                await window.originalPerformSearch();
            } else {
                await performSearch();
            }
            
            // 검색 완료 후 키워드 표시
            displaySearchKeyword(keyword);
        });

        // 검색 수행 함수
        async function performSearch() {
            try {
                // 로딩 표시
                showLoading();
                hideResults();
                hideError();

                // 검색 키워드 가져오기
                const keyword = document.getElementById('keyword').value.trim();

                // 검색 파라미터 수집
                const searchParams = collectSearchParams();

                // 서버에 검색 요청
                const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(searchParams)
                });

                if (!response.ok) {
                    throw new Error(`검색 요청 실패: ${response.status}`);
                }

                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || '검색 결과를 가져오는데 실패했습니다.');
                }

                // ✅ 새 검색 시 모든 필터 관련 변수 완전 초기화
                searchResults = data.results || [];
                allSearchResults = [...(data.results || [])]; // 원본 검색 결과 저장
                filteredResults = [...(data.results || [])]; // 필터링된 결과 초기화
                currentTimezoneFilter = {}; // 필터 상태 초기화
                
                // ✅ 새로운 검색 시 결과 표시를 일반 모드로 초기화
                const totalResultsInfo = document.getElementById('totalResultsInfo');
                if (totalResultsInfo) {
                    totalResultsInfo.style.display = 'none'; // X/Y 형태 숨기기
                }

                // 검색 완료 후 키워드 표시 (방법 2: 클라이언트 저장)
                displaySearchKeyword(keyword);

                // 결과 표시
                if (searchResults.length > 0) {
                    showResults();
                    renderResults();
                    
                    // 시간대 분석 및 필터 표시
                    analyzeSearchResults(searchResults);
                } else {
                    showNoResults();
                }

            } catch (error) {
                console.error('검색 오류:', error);
                showError(error.message);
            } finally {
                hideLoading();
            }
        }

        // 검색 키워드 표시 함수 (단순화된 버전)
        function displaySearchKeyword(keyword) {
            const searchKeywordInfo = document.getElementById('searchKeywordInfo');
            const searchKeywordElement = document.getElementById('searchKeyword');

            if (keyword && keyword.trim()) {
                searchKeywordElement.textContent = `"${keyword.trim()}"`;
                searchKeywordInfo.style.display = 'inline';
                console.log('✅ 검색 키워드 표시:', keyword);
            } else {
                searchKeywordInfo.style.display = 'none';
                console.log('ℹ️ 검색 키워드 없음 (인기 동영상 검색)');
            }
        }

        // 검색 버튼 클릭 시 키워드 표시 추가 (백업 방식)
        function addKeywordDisplayToSearchButton() {
            const searchButton = document.querySelector('.search-btn');
            if (searchButton) {
                searchButton.addEventListener('click', function() {
                    // 🔄 검색 버튼 클릭 시도 시간대 필터 초기화 (백업)
                    setTimeout(() => {
                        resetTimezoneFiltersForNewSearch();
                    }, 100); // 직후 실행
                    
                    // 짧은 지연 후 키워드 표시 (검색 완료를 기다리기 위해)
                    setTimeout(() => {
                        const keyword = document.getElementById('keyword').value.trim();
                        displaySearchKeyword(keyword);
                    }, 1000); // 1초 후 실행
                });
                console.log('✅ 검색 버튼에 키워드 표시 및 필터 초기화 기능 추가');
            }
        }

        // 새로운 검색을 위한 시간대 필터 초기화 함수
        function resetTimezoneFiltersForNewSearch() {
            console.log('🔄 새로운 검색 시작 - 시간대 필터 초기화');
            
            // 1. 필터 컴테이너 숨기기
            const filterContainer = document.getElementById('resultsFilterContainer');
            if (filterContainer) {
                filterContainer.style.display = 'none';
            }
            
            // 2. 모든 필터 체크박스 초기화 (모든 선택 상태로)
            const filterCheckboxes = [
                'filterPrimeTime', 'filterMorningCommute', 'filterLunchTime',
                'filterEveningCommute', 'filterLateNight', 'filterWorkTime',
                'filterWeekend', 'filterWeekday', 'filterMorningTime',
                'filterAfternoonTime', 'filterEveningTime', 'filterEarlyMorningTime'
            ];
            
            filterCheckboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.checked = true; // 모두 선택 상태로 초기화
                }
            });
            
            // 3. 전역 변수 초기화
            allSearchResults = [];
            filteredResults = [];
            currentTimezoneFilter = {};
            
            // 4. 초기화 완료 로그
            console.log('✅ 시간대 필터 초기화 완료');
        }
        
        // 기존 검색 결과 처리 후 시간대 필터 설정
        function setupTimezoneFilterAfterSearch(results) {
            if (results && results.length > 0) {
                // 검색 결과가 있을 때만 시간대 분석 및 필터 표시
                const analyzedResults = analyzeSearchResults(results);
                console.log('✅ 새로운 검색 결과에 대한 시간대 분석 완료');
            }
        }

        // 결과 개수 변경 감지 및 키워드 표시 (최종 백업)
        function watchForResultsUpdate() {
            const resultsCountElement = document.getElementById('resultsCount');
            if (resultsCountElement) {
                // MutationObserver를 사용하여 결과 개수 변경 감지
                const observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'childList' || mutation.type === 'characterData') {
                            const keyword = document.getElementById('keyword').value.trim();
                            displaySearchKeyword(keyword);
                            
                            // 검색 결과가 업데이트되었을 때 시간대 필터 설정
                            if (searchResults && searchResults.length > 0) {
                                setupTimezoneFilterAfterSearch(searchResults);
                            }
                        }
                    });
                });
                
                observer.observe(resultsCountElement, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });
                
                console.log('✅ 결과 개수 변경 감지 시작');
            }
        }

        // 검색 파라미터 수집 함수
        function collectSearchParams() {
            return {
                keyword: document.getElementById('keyword').value.trim(),
                country: document.querySelector('input[name="country"]:checked')?.value || 'korea',
                searchScope: getSelectedSearchScope(),
                minAvgWatchRate: document.getElementById('minAvgWatchRate').value,
                minViews: document.getElementById('minViews').value,
                maxViews: document.getElementById('maxViews').value,
                categories: getSelectedCategories(),
                maxResults: document.getElementById('maxResults').value,
                uploadPeriod: document.getElementById('uploadPeriod').value,
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                videoLength: getSelectedVideoLengths()
            };
        }

        // 선택된 검색 범위 가져오기
        function getSelectedSearchScope() {
            const checked = document.querySelectorAll('input[name="searchScope"]:checked');
            return Array.from(checked).map(cb => cb.value);
        }

        // 선택된 동영상 길이 가져오기
        function getSelectedVideoLengths() {
            const checked = document.querySelectorAll('input[name="videoLength"]:checked');
            return Array.from(checked).map(cb => cb.value);
        }

        // 선택된 카테고리 목록 반환 함수
        function getSelectedCategories() {
            const categoryCheckboxes = document.querySelectorAll('input[name="categories"]:checked');
            return Array.from(categoryCheckboxes).map(cb => cb.value);
        }

        // UI 상태 관리 함수들
        function showLoading() {
            document.getElementById('loadingIndicator').style.display = 'block';
        }

        function hideLoading() {
            document.getElementById('loadingIndicator').style.display = 'none';
        }

        function showResults() {
            document.getElementById('resultsContainer').style.display = 'block';
        }

        function hideResults() {
            document.getElementById('resultsContainer').style.display = 'none';
        }

        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        function hideError() {
            document.getElementById('errorMessage').style.display = 'none';
        }

        function showNoResults() {
            const resultsContainer = document.getElementById('resultsContainer');
            const tableBody = document.getElementById('resultsTableBody');
            
            resultsContainer.style.display = 'block';
            tableBody.innerHTML = '<tr><td colspan="14" class="no-results"><h3>검색 결과가 없습니다</h3><p>다른 검색 조건으로 시도해보세요.</p></td></tr>';
            
            // 검색 결과 개수 표시
            document.getElementById('resultsCount').textContent = '0';
        }

        // 검색 결과 렌더링 함수 (기본 구조만 제공)
        function renderResults() {
            const tableBody = document.getElementById('resultsTableBody');
            
            if (!searchResults || searchResults.length === 0) {
                showNoResults();
                return;
            }

            // 검색 결과 개수 업데이트
            document.getElementById('resultsCount').textContent = searchResults.length;
            
            // TODO: 실제 테이블 렌더링 로직은 기존 코드 활용
            console.log('검색 결과 렌더링:', searchResults.length, '개 결과');
            
            // 임시 표시 (실제 구현에서는 기존 renderResults 함수 내용 사용)
            tableBody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 20px;">✅ ${searchResults.length}개의 검색 결과를 찾았습니다.</td></tr>`;
        }



        // 검색 범위 이벤트들은 initializeApp에서 등록됨

        // 검색 범위 디스플레이 업데이트 함수
        function updateSearchScopeDisplay() {
            const searchScopeCheckboxes = document.querySelectorAll('input[name="searchScope"]:checked');
            const display = document.getElementById('searchScopeDisplay');
            
            if (searchScopeCheckboxes.length === 0) {
                display.textContent = '검색 범위를 선택해주세요';
            } else if (searchScopeCheckboxes.length === document.querySelectorAll('input[name="searchScope"]').length) {
                display.textContent = '모든 범위 선택됨';
            } else {
                const selectedNames = Array.from(searchScopeCheckboxes).map(cb => {
                    const label = cb.parentElement.querySelector('label');
                    return label.textContent;
                });
                
                // 두 개 이상 선택 시 또는 문자열이 길 때 개수로 표시
                if (searchScopeCheckboxes.length >= 2 || selectedNames.join(', ').length > 15) {
                    display.textContent = `${searchScopeCheckboxes.length}개 선택됨`;
                } else {
                    display.textContent = selectedNames.join(', ') + ' 선택됨';
                }
            }
        }

        // 페이지 로드 시 초기화
        updateSearchScopeDisplay();
        
        // 검색 키워드 표시 기능 초기화
        addKeywordDisplayToSearchButton();
        watchForResultsUpdate();

        // 모든 검색 범위 체크박스 상태 업데이트
        function updateSelectAllSearchScope() {
            const searchScopeCheckboxes = document.querySelectorAll('input[name="searchScope"]');
            const checkedSearchScope = document.querySelectorAll('input[name="searchScope"]:checked');
            const selectAllCheckbox = document.getElementById('selectAllSearchScope');
            
            if (checkedSearchScope.length === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (checkedSearchScope.length === searchScopeCheckboxes.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        // 카테고리 드롭다운 기능은 DOMContentLoaded 이벤트에서 설정됨

        // 문서 클릭 시 드롭다운 닫기
        document.addEventListener('click', (e) => {
            // 검색 범위 드롭다운 처리
            const searchScopeDisplay = document.getElementById('searchScopeDisplay');
            const searchScopeDropdown = document.getElementById('searchScopeDropdown');
            
            if (searchScopeDisplay && searchScopeDropdown) {
                const searchScopeSelector = searchScopeDisplay.closest('.category-selector');
                if (searchScopeSelector && !searchScopeSelector.contains(e.target)) {
                    searchScopeDropdown.classList.remove('show');
                }
            }
            
            // 카테고리 드롭다운 처리
            const categoryDisplay = document.getElementById('categoryDisplay');
            const categoryDropdown = document.getElementById('categoryDropdown');
            
            if (categoryDisplay && categoryDropdown) {
                const categorySelector = categoryDisplay.closest('.category-selector');
                if (categorySelector && !categorySelector.contains(e.target)) {
                    categoryDropdown.classList.remove('show');
                }
            }
            
            // 국가 드롭다운 처리 (새로 추가)
            const countryDisplay = document.getElementById('countryDisplay');
            const countryDropdown = document.getElementById('countryDropdown');
            
            if (countryDisplay && countryDropdown) {
                const countrySelector = countryDisplay.closest('.category-selector');
                if (countrySelector && !countrySelector.contains(e.target)) {
                    countryDropdown.classList.remove('show');
                }
            }
        });

        // 카테고리 이벤트들은 initializeApp에서 등록됨

        // 카테고리 디스플레이 업데이트 함수
        function updateCategoryDisplay() {
            const categoryCheckboxes = document.querySelectorAll('input[name="categories"]:checked');
            const display = document.getElementById('categoryDisplay');
            
            if (categoryCheckboxes.length === 0) {
                display.textContent = '카테고리를 선택해주세요';
            } else if (categoryCheckboxes.length === document.querySelectorAll('input[name="categories"]').length) {
                display.textContent = '모든 카테고리 선택됨';
            } else if (categoryCheckboxes.length <= 3) {
                const selectedNames = Array.from(categoryCheckboxes).map(cb => {
                    const label = cb.parentElement.querySelector('label');
                    return label.textContent;
                });
                display.textContent = selectedNames.join(', ');
            } else {
                display.textContent = `${categoryCheckboxes.length}개 카테고리 선택됨`;
            }
        }

        // 모든 카테고리 체크박스 상태 업데이트
        function updateSelectAllCategories() {
            const categoryCheckboxes = document.querySelectorAll('input[name="categories"]');
            const checkedCategories = document.querySelectorAll('input[name="categories"]:checked');
            const selectAllCheckbox = document.getElementById('selectAllCategories');
            
            if (checkedCategories.length === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (checkedCategories.length === categoryCheckboxes.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        // 썸네일 다운로드 함수 (파일명 안전화 처리)
        async function downloadThumbnail(url, channelName) {
            try {
                console.log('📥 썸네일 다운로드 시작:', { url, channelName });
                
                // 채널명을 안전한 파일명으로 변환 (서버 측과 동일한 로직)
                let safeChannelName = channelName || 'channel';
                
                // 특수문자 및 유니코드 문자 처리
                safeChannelName = safeChannelName
                    .normalize('NFD')                          // 유니코드 정규화
                    .replace(/[\u0300-\u036f]/g, '')          // 발음 기호 제거
                    .replace(/[^\x00-\x7F]/g, '')             // ASCII가 아닌 문자 제거 (한글, 이모지 등)
                    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')   // 파일명에 사용 불가한 문자들 제거
                    .replace(/["'`]/g, '')                    // 따옴표 제거
                    .replace(/\s+/g, '_')                     // 공백을 언더스코어로 변경
                    .replace(/_{2,}/g, '_')                   // 연속된 언더스코어를 하나로 변경
                    .replace(/^_+|_+$/g, '')                  // 앞뒤 언더스코어 제거
                    .substring(0, 50);                       // 파일명 길이 제한 (클라이언트에서는 더 짧게)
                
                // 파일명이 비어있으면 기본값 설정
                if (!safeChannelName || safeChannelName.length === 0) {
                    safeChannelName = 'channel';
                }
                
                // 현재 날짜시간을 파일명에 추가 (중복 방지)
                const now = new Date();
                const year = now.getFullYear().toString().slice(-2); // 뒤 2자리만 (25)
                const month = (now.getMonth() + 1).toString().padStart(2, '0');
                const day = now.getDate().toString().padStart(2, '0');
                const hour = now.getHours().toString().padStart(2, '0');
                const minute = now.getMinutes().toString().padStart(2, '0');
                const second = now.getSeconds().toString().padStart(2, '0');
                const millisecond = now.getMilliseconds().toString().padStart(3, '0');
                
                const timestamp = `${year}${month}${day}${hour}${minute}${second}${millisecond}`;
                const filename = `${safeChannelName}_${timestamp}.jpg`;
                
                console.log('🔧 파일명 변환:', { 
                    original: channelName, 
                    safe: safeChannelName, 
                    final: filename 
                });
                
                // 최신 브라우저에서 File System Access API 지원 확인
                if ('showSaveFilePicker' in window) {
                    // File System Access API 사용 (Chrome 86+, Edge 86+)
                    await downloadWithFilePicker(url, filename);
                } else if ('showDirectoryPicker' in window) {
                    // Directory Picker API 사용 (대체 방법)
                    await downloadWithDirectoryPicker(url, filename, channelName);
                } else {
                    // 기존 방식 (자동 다운로드) - 브라우저 호환성을 위한 fallback
                    await downloadWithTraditionalMethod(url, filename);
                }
                
            } catch (error) {
                console.error('다운로드 오류:', error);
                
                // 구체적인 오류 메시지 제공
                if (error.message.includes('Content-Disposition') || 
                    error.message.includes('ERR_INVALID_CHAR') ||
                    error.message.includes('Invalid character in header')) {
                    alert(`❌ 파일명 오류: 채널명에 특수문자가 포함되어 다운로드에 실패했습니다.\n\n원인: "${channelName}"에 HTTP 헤더에서 허용되지 않는 문자가 포함되어 있습니다.\n해결: 파일명이 자동으로 안전한 형태로 변환되었지만 서버에서 처리하지 못했습니다.\n\n다시 시도해 주세요.`);
                } else if (error.name === 'AbortError') {
                    console.log('사용자가 다운로드를 취소했습니다.');
                } else {
                    alert(`❌ 썸네일 다운로드에 실패했습니다.\n\n오류: ${error.message}\n\n가능한 원인:\n- 네트워크 연결 문제\n- 썸네일 이미지 서버 접근 불가\n- 파일명 처리 오류\n\n잠시 후 다시 시도해 주세요.`);
                }
            }
        }

        // File System Access API를 사용한 파일 저장 (개선된 버전)
        async function downloadWithFilePicker(url, filename) {
            try {
                // 파일 저장 위치 선택 다이얼로그 표시
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: '이미지 파일',
                        accept: {
                            'image/jpeg': ['.jpg', '.jpeg'],
                            'image/png': ['.png'],
                            'image/webp': ['.webp']
                        }
                    }]
                });

                // URL 인코딩을 안전하게 처리
                const encodedUrl = encodeURIComponent(url);
                const encodedFilename = encodeURIComponent(filename);
                
                console.log('🔄 서버 요청:', {
                    url: `/api/download-thumbnail?url=${encodedUrl}&filename=${encodedFilename}`,
                    originalUrl: url,
                    originalFilename: filename
                });
                
                const response = await fetch(`/api/download-thumbnail?url=${encodedUrl}&filename=${encodedFilename}`);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch {
                        errorData = { error: errorText };
                    }
                    throw new Error(`서버 오류 (${response.status}): ${errorData.error || 'Unknown error'}`);
                }
                
                const blob = await response.blob();
                
                // 선택한 위치에 파일 저장
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`✅ 썸네일 저장 완료: ${filename}`);
                alert(`✅ 썸네일이 선택한 위치에 저장되었습니다!\n\n파일명: ${filename}\n크기: ${(blob.size / 1024).toFixed(1)} KB`);
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('사용자가 저장을 취소했습니다.');
                } else {
                    console.error('File System Access API 다운로드 오류:', error);
                    throw error;
                }
            }
        }

        // Directory Picker API를 사용한 폴더 선택 저장
        async function downloadWithDirectoryPicker(url, filename, channelName) {
            try {
                // 폴더 선택 다이얼로그 표시
                const dirHandle = await window.showDirectoryPicker();
                
                // 썸네일 이미지 다운로드
                const response = await fetch(`/api/download-thumbnail?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`);
                
                // 서버에서 전송한 로그를 콘솔에 출력
                const downloadLog = response.headers.get('X-Download-Log');
                if (downloadLog) {
                    try {
                        const logData = JSON.parse(downloadLog);
                        console.log(`📥 썸네일 다운로드 로그: ${logData.message}`);
                        
                        // 오류가 있는 경우 상세 정보 출력
                        if (logData.step === 'error') {
                            console.error(`❌ 썸네일 다운로드 실패: ${logData.error}`);
                            console.error(`📋 상세 정보: ${logData.details}`);
                            console.error(`🔗 URL: ${logData.url}`);
                        }
                    } catch (parseError) {
                        console.log('📥 썸네일 다운로드 로그 파싱 실패:', parseError);
                    }
                }
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || 'Unknown error'}`);
                }
                
                const blob = await response.blob();
                
                // 선택한 폴더에 파일 생성 및 저장
                const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                alert(`✅ 썸네일이 선택한 폴더에 저장되었습니다!\n파일명: ${filename}`);
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('사용자가 폴더 선택을 취소했습니다.');
                } else {
                    throw error;
                }
            }
        }

        // 기존 방식 다운로드 (개선된 버전)
        async function downloadWithTraditionalMethod(url, filename) {
            try {
                // URL 인코딩을 안전하게 처리
                const encodedUrl = encodeURIComponent(url);
                const encodedFilename = encodeURIComponent(filename);
                
                console.log('🔄 기존 방식 다운로드:', { filename, encodedFilename });
                
                // 먼저 서버에서 파일을 가져와서 오류가 있는지 확인
                const testResponse = await fetch(`/api/download-thumbnail?url=${encodedUrl}&filename=${encodedFilename}`);
                
                if (!testResponse.ok) {
                    const errorText = await testResponse.text();
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch {
                        errorData = { error: errorText };
                    }
                    throw new Error(`서버 오류 (${testResponse.status}): ${errorData.error || 'Unknown error'}`);
                }
                
                // 성공한 경우 다운로드 링크 생성
                const downloadUrl = `/api/download-thumbnail?url=${encodedUrl}&filename=${encodedFilename}`;
                
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                console.log(`✅ 기존 방식 다운로드 완료: ${filename}`);
                alert(`📁 기본 다운로드 폴더에 저장됩니다.\n\n파일명: ${filename}\n위치: 브라우저 기본 다운로드 폴더\n(브라우저가 폴더 선택 기능을 지원하지 않습니다)`);
                
            } catch (error) {
                console.error('기존 방식 다운로드 오류:', error);
                throw error;
            }
        }

        // 페이지당 아이템 수 변경 이벤트
        document.getElementById('itemsPerPage').addEventListener('change', (e) => {
            itemsPerPage = parseInt(e.target.value);
            currentPage = 1;
            renderResults();
        });

        // Excel 다운로드 버튼 이벤트
        document.getElementById('downloadExcelBtn').addEventListener('click', async () => {
            await downloadExcel();
        });

        // 동영상 길이 "모두 선택" 체크박스 이벤트
        document.getElementById('selectAllVideoLength').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const videoLengthCheckboxes = [
                'shortForm1', 'shortForm2', 'midForm1', 'midForm2', 
                'longForm1', 'longForm2', 'longForm3', 'longForm4', 'longForm5', 'longForm6'
            ];
            
            videoLengthCheckboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.checked = isChecked;
                }
            });
            
            // 그룹 선택 체크박스 상태도 업데이트
            updateGroupCheckboxes();
        });

        // 동영상 길이 "맨 앞 두 개만" 체크박스 이벤트
        document.getElementById('selectFirst2VideoLength').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const first2Checkboxes = ['shortForm1', 'shortForm2'];
            
            first2Checkboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.checked = isChecked;
                }
            });
            
            updateSelectAllVideoLength();
            updateGroupCheckboxes();
        });

        // 동영상 길이 "그 뒤 세 개만" 체크박스 이벤트
        document.getElementById('selectNext3VideoLength').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const next3Checkboxes = ['midForm1', 'midForm2', 'longForm1'];
            
            next3Checkboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.checked = isChecked;
                }
            });
            
            updateSelectAllVideoLength();
            updateGroupCheckboxes();
        });

        // 동영상 길이 "위 5개 선택" 체크박스 이벤트
        document.getElementById('selectTop5VideoLength').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const top5Checkboxes = ['shortForm1', 'shortForm2', 'midForm1', 'midForm2', 'longForm1'];
            
            top5Checkboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.checked = isChecked;
                }
            });
            
            updateSelectAllVideoLength();
            updateGroupCheckboxes();
        });

        // 동영상 길이 "밑 5개 선택" 체크박스 이벤트
        document.getElementById('selectBottom5VideoLength').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const bottom5Checkboxes = ['longForm2', 'longForm3', 'longForm4', 'longForm5', 'longForm6'];
            
            bottom5Checkboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.checked = isChecked;
                }
            });
            
            updateSelectAllVideoLength();
            updateGroupCheckboxes();
        });

        // 채널 개설일 포맷 함수 (새 기능)
        function formatChannelCreatedDate(createdDate) {
            if (!createdDate) {
                return '조회 안됨';
            }
            
            try {
                const date = new Date(createdDate);
                const year = date.getFullYear();
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const day = date.getDate().toString().padStart(2, '0');
                
                return `${year}.${month}.${day}`;
            } catch (error) {
                console.error('채널 개설일 포맷 오류:', error);
                return '조회 안됨';
            }
        }
        


        // 개별 동영상 길이 체크박스 변경 시 "모두 선택" 상태 업데이트
        function updateSelectAllVideoLength() {
            const videoLengthCheckboxes = [
                'shortForm1', 'shortForm2', 'midForm1', 'midForm2', 
                'longForm1', 'longForm2', 'longForm3', 'longForm4', 'longForm5', 'longForm6'
            ];
            
            const checkedCount = videoLengthCheckboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectAllCheckbox = document.getElementById('selectAllVideoLength');
            if (checkedCount === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (checkedCount === videoLengthCheckboxes.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        // 동영상 국가 감지 함수 (수정됨 - 검색 국가 우선 표시)
        function detectVideoCountry(video) {
            // 1. 검색한 국가를 우선적으로 표시 (가장 중요한 변경점)
            if (typeof primarySearchCountry !== 'undefined' && primarySearchCountry && primarySearchCountry !== 'worldwide') {
                const countryNames = {
                    'korea': '한국',
                    'usa': '미국',
                    'japan': '일본',
                    'uk': '영국',
                    'germany': '독일',
                    'france': '프랑스',
                    'canada': '캐나다',
                    'australia': '호주',
                    'india': '인도',
                    'brazil': '브라질',
                    'mexico': '멕시코',
                    'italy': '이탈리아',
                    'spain': '스페인',
                    'china': '중국',
                    'newzealand': '뉴질랜드',
                    'switzerland': '스위스',
                    'norway': '노르웨이',
                    'ireland': '아일랜드',
                    'netherlands': '네덜란드',
                    'denmark': '덴마크',
                    'hongkong': '홍콩',
                    'sweden': '스웨덴',
                    'finland': '핀란드',
                    'singapore': '싱가포르',
                    'austria': '오스트리아',
                    'luxembourg': '룩셈부르크',
                    'belgium': '벨기에',
                    'czechrepublic': '체코',
                    'israel': '이스라엘',
                    'portugal': '포르투갈',
                    'uae': 'UAE',
                    'qatar': '카타르',
                    'kuwait': '쿠웨이트',
                    'saudi': '사우디아라비아',
                    'poland': '폴란드',
                    'southafrica': '남아프리카공화국',
                    'turkey': '터키',
                    'hungary': '헝가리',
                    'suriname': '수리남',
                    'colombia': '콜롬비아',
                    'argentina': '아르헨티나',
                    'mozambique': '모잠비크',
                    'indonesia': '인도네시아',
                    'vietnam': '베트남',
                    'pakistan': '파키스탄',
                    'bangladesh': '방글라데시',
                    'jamaica': '자메이카',
                    'libya': '리비아',
                    'iceland': '아이슬란드',
                    'srilanka': '스리랑카'
                };
                
                const searchedCountryName = countryNames[primarySearchCountry.toLowerCase()];
                if (searchedCountryName) {
                    return searchedCountryName;
                }
            }
            
            // 2. 전세계 검색인 경우에만 언어 패턴으로 분석
            if (typeof primarySearchCountry !== 'undefined' && primarySearchCountry === 'worldwide') {
                // 채널명이나 제목에서 언어 패턴 분석
                const koreanPattern = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
                const japanesePattern = /[ひらがなカタカナ一-龯]/;
                const chinesePattern = /[\u4e00-\u9fff]/;
                
                const title = video.title || '';
                const channelName = video.youtube_channel_name || '';
                const fullText = title + ' ' + channelName;
                
                if (koreanPattern.test(fullText)) {
                    return '한국';
                } else if (japanesePattern.test(fullText)) {
                    return '일본';
                } else if (chinesePattern.test(fullText)) {
                    return '중국';
                }
                
                // 언어 패턴으로 구분이 안 되면 '해외' 표시
                return '해외';
            }
            
            // 3. 기본값 (오류 방지)
            return '알 수 없음';
        }
        
        // 날짜/시간 셀 생성 함수 (개선됨)
        function generateDateTimeCells(result, uploadDateObj) {
            const countryName = detectVideoCountry(result).toLowerCase();
            const isKoreanVideo = countryName === '한국';
            
            // 업로드일 컬럼 (동영상 원본 국가 시간대)
            let uploadDateCell;
            if (isKoreanVideo) {
                // 한국 동영상인 경우 집 이모지 표시
                uploadDateCell = `
                    <td>
                        <div class="upload-date home-icon">
                            <span title="한국 동영상 (현지 시간)">🏠</span>
                        </div>
                    </td>
                `;
            } else {
                // 다른 국가 동영상인 경우 해당 국가 시간대로 표시
                const countryTimezones = {
                    '미국': { tz: 'America/New_York', abbr: 'EST' },
                    '일본': { tz: 'Asia/Tokyo', abbr: 'JST' },
                    '영국': { tz: 'Europe/London', abbr: 'GMT' },
                    '독일': { tz: 'Europe/Berlin', abbr: 'CET' },
                    '프랑스': { tz: 'Europe/Paris', abbr: 'CET' },
                    '캐나다': { tz: 'America/Toronto', abbr: 'EST' },
                    '호주': { tz: 'Australia/Sydney', abbr: 'AEDT' },
                    '인도': { tz: 'Asia/Kolkata', abbr: 'IST' },
                    '브라질': { tz: 'America/Sao_Paulo', abbr: 'BRT' },
                    '멕시코': { tz: 'America/Mexico_City', abbr: 'CST' },
                    '이탈리아': { tz: 'Europe/Rome', abbr: 'CET' },
                    '스페인': { tz: 'Europe/Madrid', abbr: 'CET' },
                    '중국': { tz: 'Asia/Shanghai', abbr: 'CST' }
                };
                
                const tzInfo = countryTimezones[countryName] || { tz: 'UTC', abbr: 'UTC' };
                const localTime = new Date(result.status_date).toLocaleString('en-CA', {
                    timeZone: tzInfo.tz,
                    weekday: 'short',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                
                const [weekdayPart, datePart, timePart] = localTime.split(', ');
                const timeOnly = timePart ? timePart.substring(0, 5) : '';
                const weekdayAbbr = weekdayPart ? weekdayPart.toUpperCase() : '';
                
                // 새로운 HTML 구조로 시간 표시
                const timeDisplayHTML = `<span class="time-display"><span class="weekday-bold">${weekdayAbbr}</span> <span class="time-red-bold">${timeOnly}</span> <span class="timezone-bold">${tzInfo.abbr}</span></span>`;
                
                console.log('🕰️ 업로드일 HTML 생성:', timeDisplayHTML);
                
                uploadDateCell = `
                    <td>
                        <div class="upload-date detailed-time">
                            <div class="date-part">${datePart}</div>
                            <div class="time-part">${timeDisplayHTML}</div>
                        </div>
                    </td>
                `;
            }
            
            // 한국시간 컬럼 (항상 한국 시간대로 표시)
            const koreanTime = new Date(result.status_date).toLocaleString('en-CA', {
                timeZone: 'Asia/Seoul',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            const [koreanDatePart, koreanTimePart] = koreanTime.split(', ');
            const koreanTimeOnly = koreanTimePart ? koreanTimePart.substring(0, 5) : '';
            
            // 한국시간도 동일한 형식으로 표시 (요일 정보 추가)
            const koreanDate = new Date(result.status_date);
            const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const koreanDayOfWeek = dayNames[koreanDate.getDay()];
            const koreaTimeHTML = `<span class="time-display"><span class="weekday-bold">${koreanDayOfWeek}</span> <span class="time-red-bold">${koreanTimeOnly}</span> <span class="timezone-bold">KST</span></span>`;
            
            console.log('🕰️ 한국시간 HTML 생성:', koreaTimeHTML);
            
            const koreaTimeCell = `
                <td>
                    <div class="upload-date detailed-time">
                        <div class="date-part">${koreanDatePart}</div>
                        <div class="time-part" data-time="${koreanTimeOnly}" data-timezone="KST">${koreaTimeHTML}</div>
                    </div>
                </td>
            `;
            
            return { uploadDateCell, koreaTimeCell };
        }
        
        // 검색 시나리오 및 기준 국가 변수들
        let currentSearchScenario = 'single-country';
        let primarySearchCountry = 'korea';
        
        // 검색 시나리오 판별 함수
        function determineSearchScenario(selectedCountries) {
            if (selectedCountries.length === 0 || (selectedCountries.length === 1 && selectedCountries[0] === 'worldwide')) {
                return 'worldwide';
            } else if (selectedCountries.length === 1) {
                return 'single-country';
            } else {
                return 'multi-country';
            }
        }
        
        // 테이블 헤더 업데이트 함수
        function updateTableHeaders() {
            const uploadDateHeader = document.getElementById('uploadDateHeader');
            const koreaTimeHeader = document.getElementById('koreaTimeHeader');
            
            if (uploadDateHeader && koreaTimeHeader) {
                switch(currentSearchScenario) {
                    case 'single-country':
                        if (primarySearchCountry === 'korea') {
                            uploadDateHeader.textContent = '📅 업로드일';
                            koreaTimeHeader.textContent = '🏠 한국시간';
                        } else {
                            const countryNames = {
                                'usa': '미국', 'japan': '일본', 'uk': '영국', 'germany': '독일',
                                'france': '프랑스', 'canada': '캐나다', 'australia': '호주',
                                'india': '인도', 'brazil': '브라질', 'mexico': '멕시코',
                                'italy': '이탈리아', 'spain': '스페인', 'china': '중국'
                            };
                            const countryName = countryNames[primarySearchCountry] || primarySearchCountry;
                            uploadDateHeader.textContent = `📅 ${countryName}시간`;
                            koreaTimeHeader.textContent = '🏠 한국시간';
                        }
                        break;
                    case 'multi-country':
                    case 'worldwide':
                        uploadDateHeader.textContent = '📅 업로드일';
                        koreaTimeHeader.textContent = '🏠 한국시간';
                        break;
                }
            }
        }
        
        // 수정된 업로드 시간대 분석 함수들 - 시간대 변환 로직 개선
        function analyzeUploadTime(publishedAt, targetCountry = 'korea') {
            const publishDate = new Date(publishedAt);
            
            // 국가별 시간대 매핑 (IANA 시간대 식별자 사용)
            const countryTimezones = {
                'korea': 'Asia/Seoul',
                'usa': 'America/New_York',  // 동부 표준시
                'japan': 'Asia/Tokyo',
                'uk': 'Europe/London',
                'germany': 'Europe/Berlin',
                'france': 'Europe/Paris',
                'canada': 'America/Toronto',
                'australia': 'Australia/Sydney',
                'india': 'Asia/Kolkata',
                'brazil': 'America/Sao_Paulo',
                'mexico': 'America/Mexico_City',
                'italy': 'Europe/Rome',
                'spain': 'Europe/Madrid',
                'china': 'Asia/Shanghai',
                'israel': 'Asia/Jerusalem',
                'russia': 'Europe/Moscow',
                // 누락된 34개국 추가
                'newzealand': 'Pacific/Auckland',
                'switzerland': 'Europe/Zurich',
                'norway': 'Europe/Oslo',
                'ireland': 'Europe/Dublin',
                'netherlands': 'Europe/Amsterdam',
                'denmark': 'Europe/Copenhagen',
                'hongkong': 'Asia/Hong_Kong',
                'sweden': 'Europe/Stockholm',
                'finland': 'Europe/Helsinki',
                'singapore': 'Asia/Singapore',
                'austria': 'Europe/Vienna',
                'luxembourg': 'Europe/Luxembourg',
                'belgium': 'Europe/Brussels',
                'czechrepublic': 'Europe/Prague',
                'portugal': 'Europe/Lisbon',
                'uae': 'Asia/Dubai',
                'qatar': 'Asia/Qatar',
                'kuwait': 'Asia/Kuwait',
                'saudi': 'Asia/Riyadh',
                'poland': 'Europe/Warsaw',
                'southafrica': 'Africa/Johannesburg',
                'turkey': 'Europe/Istanbul',
                'hungary': 'Europe/Budapest',
                'suriname': 'America/Paramaribo',
                'colombia': 'America/Bogota',
                'argentina': 'America/Argentina/Buenos_Aires',
                'mozambique': 'Africa/Maputo',
                'indonesia': 'Asia/Jakarta',
                'vietnam': 'Asia/Ho_Chi_Minh',
                'pakistan': 'Asia/Karachi',
                'bangladesh': 'Asia/Dhaka',
                'jamaica': 'America/Jamaica',
                'libya': 'Africa/Tripoli',
                'iceland': 'Atlantic/Reykjavik',
                'srilanka': 'Asia/Colombo',
                'worldwide': 'UTC'
            };
            
            const timezone = countryTimezones[targetCountry.toLowerCase()] || 'Asia/Seoul';
            
            // Intl.DateTimeFormat을 사용하여 정확한 시간대 변환
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            // 시간대 변환된 시간 정보 가져오기
            const parts = formatter.formatToParts(publishDate);
            const partsObj = parts.reduce((acc, part) => {
                acc[part.type] = part.value;
                return acc;
            }, {});
            
            // 변환된 시간에서 시간과 요일 정보 추출
            const localTime = new Date(
                parseInt(partsObj.year),
                parseInt(partsObj.month) - 1,
                parseInt(partsObj.day),
                parseInt(partsObj.hour),
                parseInt(partsObj.minute),
                parseInt(partsObj.second)
            );
            
            const hour = parseInt(partsObj.hour);
            const dayOfWeek = localTime.getDay(); // 0=일요일, 6=토요일
            
            return {
                hour: hour,
                dayOfWeek: dayOfWeek,
                isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
                timeCategory: getTimeCategory(hour),
                timezone: timezone,
                localTimeString: formatter.format(publishDate),
                originalDate: publishDate,
                convertedDate: localTime
            };
        }
        
        function getTimeCategory(hour) {
            // 시간대별 카테고리 분류
            if (hour >= 6 && hour < 9) return 'morning-commute'; // 아침 출근시간
            if (hour >= 9 && hour < 12) return 'morning-work'; // 오전 업무시간
            if (hour >= 12 && hour < 14) return 'lunch-time'; // 점심시간
            if (hour >= 14 && hour < 18) return 'afternoon-work'; // 오후 업무시간
            if (hour >= 18 && hour < 20) return 'evening-commute'; // 저녁 퇴근시간
            if (hour >= 20 && hour < 23) return 'prime-time'; // 골든타임
            if (hour >= 23 || hour < 2) return 'late-night'; // 심야시간
            if (hour >= 2 && hour < 6) return 'early-morning'; // 새벽시간
            return 'other';
        }
        
        function getTimeCategoryKorean(category) {
            const categories = {
                'morning-commute': '아침 출근시간 (06-09시)',
                'morning-work': '오전 업무시간 (09-12시)',
                'lunch-time': '점심시간 (12-14시)',
                'afternoon-work': '오후 업무시간 (14-18시)',
                'evening-commute': '저녁 퇴근시간 (18-20시)',
                'prime-time': '골든타임 (20-23시)',
                'late-night': '심야시간 (23-02시)',
                'early-morning': '새벽시간 (02-06시)',
                'other': '기타'
            };
            return categories[category] || '알 수 없음';
        }

        // 실시간 아날로그 시계 표시 함수
        function initializeDateTime() {
            function updateAnalogClock() {
                const now = new Date();
                const hours = now.getHours() % 12;
                const minutes = now.getMinutes();
                const seconds = now.getSeconds();
                
                // 각도 계산 (12시 방향이 0도)
                const hourAngle = (hours * 30) + (minutes * 0.5); // 시침: 한 시간당 30도 + 분당 0.5도
                const minuteAngle = minutes * 6; // 분침: 한 분당 6도
                const secondAngle = seconds * 6; // 초침: 한 초당 6도
                
                // 바늘 회전 적용
                const hourHand = document.getElementById('hourHand');
                const minuteHand = document.getElementById('minuteHand');
                const secondHand = document.getElementById('secondHand');
                
                if (hourHand) {
                    hourHand.style.transform = `rotate(${hourAngle}deg)`;
                }
                if (minuteHand) {
                    minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
                }
                if (secondHand) {
                    secondHand.style.transform = `rotate(${secondAngle}deg)`;
                }
            }
            
            // 즉시 실행
            updateAnalogClock();
            
            // 1초마다 업데이트
            setInterval(updateAnalogClock, 1000);
        }

        // 통합된 초기화 함수
        function initializeApp() {
            
            // 실시간 날짜/시간 표시 기능 초기화
            initializeDateTime();
            
            // 동영상 길이 체크박스 이벤트 리스너 추가
            const videoLengthCheckboxes = [
                'shortForm1', 'shortForm2', 'midForm1', 'midForm2', 
                'longForm1', 'longForm2', 'longForm3', 'longForm4', 'longForm5', 'longForm6'
            ];
            
            videoLengthCheckboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.addEventListener('change', () => {
                        updateSelectAllVideoLength();
                        updateGroupCheckboxes();
                    });
                }
            });
            
            // 카테고리 드롭다운 초기화
            const categoryDisplay = document.getElementById('categoryDisplay');
            const categoryDropdown = document.getElementById('categoryDropdown');
            
            if (categoryDisplay && categoryDropdown) {
                categoryDisplay.addEventListener('click', categoryDisplayClickHandler);
                categoryDisplay.addEventListener('keydown', categoryDisplayKeyHandler);
            }
            
            // 국가 드롭다운 초기화
            const countryDisplay = document.getElementById('countryDisplay');
            const countryDropdown = document.getElementById('countryDropdown');
            
            if (countryDisplay && countryDropdown) {
                countryDisplay.addEventListener('click', countryDisplayClickHandler);
                countryDisplay.addEventListener('keydown', countryDisplayKeyHandler);
            }
            
            // 국가 라디오 버튼 이벤트 리스너 추가 (Single Choice)
            document.querySelectorAll('input[name="country"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    updateCountryDisplay();
                    // 드롭다운 자동 닫기
                    const dropdown = document.getElementById('countryDropdown');
                    if (dropdown) {
                        dropdown.classList.remove('show');
                    }
                });
            });
            
            // 모든 카테고리 선택/해제 이벤트 추가
            const selectAllCategoriesCheckbox = document.getElementById('selectAllCategories');
            if (selectAllCategoriesCheckbox) {
                selectAllCategoriesCheckbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    const categoryCheckboxes = document.querySelectorAll('input[name="categories"]');
                    
                    categoryCheckboxes.forEach(checkbox => {
                        checkbox.checked = isChecked;
                    });
                    
                    updateCategoryDisplay();
                });
            }
            
            // 카테고리 체크박스 이벤트 리스너 추가
            document.querySelectorAll('input[name="categories"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    updateCategoryDisplay();
                    updateSelectAllCategories();
                });
            });
            
            // 초기 상태 설정
            updateSelectAllVideoLength();
            updateGroupCheckboxes();
            updateSearchScopeDisplay();
            updateCategoryDisplay();
            updateCountryDisplay();
            
            // 검색 범위 드롭다운 초기화
            const searchScopeDisplay = document.getElementById('searchScopeDisplay');
            if (searchScopeDisplay) {
                searchScopeDisplay.addEventListener('click', () => {
                    const dropdown = document.getElementById('searchScopeDropdown');
                    dropdown.classList.toggle('show');
                });
            }
            
            // "모든 범위" 체크박스 이벤트
            const selectAllSearchScope = document.getElementById('selectAllSearchScope');
            if (selectAllSearchScope) {
                selectAllSearchScope.addEventListener('change', (e) => {
                    const searchScopeCheckboxes = document.querySelectorAll('input[name="searchScope"]');
                    searchScopeCheckboxes.forEach(checkbox => {
                        checkbox.checked = e.target.checked;
                    });
                    updateSearchScopeDisplay();
                    updateSelectAllSearchScope();
                });
            }
            
            // 개별 검색 범위 체크박스 이벤트
            document.querySelectorAll('input[name="searchScope"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    updateSearchScopeDisplay();
                    updateSelectAllSearchScope();
                });
            });
            
            // 시간대 필터 초기화
            initializeTimezoneFilter();
            
            // 조회수 컬럼 4단계 순환 토글 상태 변수
            let viewCountSortState = 0; // 0: 전체조회수↓, 1: 전체조회수↑, 2: 유효조회수↓, 3: 유효조회수↑

            // 구독자수 컬럼 4단계 순환 토글 상태 변수
            let subscriberSortState = -1; // -1: 초기상태, 0: 구독자수↓, 1: 구독자수↑, 2: 유효조회수백분률↓, 3: 유효조회수백분률↑

            // 조회수 컬럼 정렬 상태 시각적 표시 함수
            function updateViewCountSortDisplay(headerElement, state) {
                // 기존 클래스 제거
                headerElement.classList.remove('view-sort-state', 'total-desc', 'total-asc', 'valid-desc', 'valid-asc');
                
                // 새로운 클래스 추가
                headerElement.classList.add('view-sort-state');
                switch(state) {
                    case 0: headerElement.classList.add('total-desc'); break;
                    case 1: headerElement.classList.add('total-asc'); break;
                    case 2: headerElement.classList.add('valid-desc'); break;
                    case 3: headerElement.classList.add('valid-asc'); break;
                }
            }

            // 구독자수 컬럼 정렬 상태 시각적 표시 함수
            function updateSubscriberSortDisplay(headerElement, state) {
                // 기존 클래스 제거
                headerElement.classList.remove('subscriber-sort-state', 'sub-desc', 'sub-asc', 'rate-desc', 'rate-asc');
                
                // 새로운 클래스 추가
                headerElement.classList.add('subscriber-sort-state');
                switch(state) {
                    case 0: headerElement.classList.add('sub-desc'); break;
                    case 1: headerElement.classList.add('sub-asc'); break;
                    case 2: headerElement.classList.add('rate-desc'); break;
                    case 3: headerElement.classList.add('rate-asc'); break;
                }
            }

            // 좋아요 컬럼 정렬 상태 시각적 표시 함수
            function updateLikesSortDisplay(headerElement, state) {
                // 기존 클래스 제거
                headerElement.classList.remove('likes-sort-state', 'count-desc', 'count-asc', 'percent-desc', 'percent-asc');
                
                // 새로운 클래스 추가
                headerElement.classList.add('likes-sort-state');
                switch(state) {
                    case 0: headerElement.classList.add('count-desc'); break;
                    case 1: headerElement.classList.add('count-asc'); break;
                    case 2: headerElement.classList.add('percent-desc'); break;
                    case 3: headerElement.classList.add('percent-asc'); break;
                }
            }

            // 국가 컬럼 정렬 상태 시각적 표시 함수
            function updateCountrySortDisplay(headerElement, state) {
                // 기존 클래스 제거
                headerElement.classList.remove('country-sort-state', 'name-desc', 'name-asc', 'rpm-desc', 'rpm-asc');
                
                // 새로운 클래스 추가
                headerElement.classList.add('country-sort-state');
                switch(state) {
                    case 0: headerElement.classList.add('name-desc'); break;
                    case 1: headerElement.classList.add('name-asc'); break;
                    case 2: headerElement.classList.add('rpm-desc'); break;
                    case 3: headerElement.classList.add('rpm-asc'); break;
                }
            }

            // RPM 컬럼 정렬 상태 시각적 표시 함수
            function updateRpmSortDisplay(headerElement, state) {
                // 기존 클래스 제거
                headerElement.classList.remove('rpm-sort-state', 'estimate-desc', 'estimate-asc', 'total-desc', 'total-asc');
                
                // 새로운 클래스 추가
                headerElement.classList.add('rpm-sort-state');
                switch(state) {
                    case 0: headerElement.classList.add('estimate-desc'); break;
                    case 1: headerElement.classList.add('estimate-asc'); break;
                    case 2: headerElement.classList.add('total-desc'); break;
                    case 3: headerElement.classList.add('total-asc'); break;
                }
            }

            // 재생시간 컬럼 정렬 상태 시각적 표시 함수
            function updateDurationSortDisplay(headerElement, state) {
                // 기존 클래스 제거
                headerElement.classList.remove('duration-sort-state', 'time-desc', 'time-asc', 'percent-desc', 'percent-asc');
                
                // 새로운 클래스 추가
                headerElement.classList.add('duration-sort-state');
                switch(state) {
                    case 0: headerElement.classList.add('time-desc'); break;
                    case 1: headerElement.classList.add('time-asc'); break;
                    case 2: headerElement.classList.add('percent-desc'); break;
                    case 3: headerElement.classList.add('percent-asc'); break;
                }
            }
            
            // 테이블 헤더 클릭 이벤트 (정렬)
            document.querySelectorAll('.results-table th.sortable').forEach(th => {
                // 조회수 컬럼 특별 처리
                if (th.dataset.sort === 'daily_view_count') {
                    th.addEventListener('click', () => {
                        // 4단계 순환 토글
                        viewCountSortState = (viewCountSortState + 1) % 4;
                        
                        switch(viewCountSortState) {
                            case 0: // 전체조회수 내림차순
                                sortColumn = 'daily_view_count';
                                sortDirection = 'desc';
                                break;
                            case 1: // 전체조회수 오름차순
                                sortColumn = 'daily_view_count';
                                sortDirection = 'asc';
                                break;
                            case 2: // 유효조회수 내림차순
                                sortColumn = 'valid_view_count';
                                sortDirection = 'desc';
                                break;
                            case 3: // 유효조회수 오름차순
                                sortColumn = 'valid_view_count';
                                sortDirection = 'asc';
                                break;
                        }
                        
                        console.log(`조회수 정렬 상태: ${viewCountSortState}, 컬럼: ${sortColumn}, 방향: ${sortDirection}`);
                        updateViewCountSortDisplay(th, viewCountSortState);
                        sortResults();
                        renderResults();
                    });
                }
                // 구독자수 컬럼 특별 처리
                else if (th.dataset.sort === 'subscriber_count') {
                    th.addEventListener('click', () => {
                        // 4단계 순환 토글
                        subscriberSortState = (subscriberSortState + 1) % 4;
                        
                        switch(subscriberSortState) {
                            case 0: // 구독자수 내림차순
                                sortColumn = 'subscriber_count';
                                sortDirection = 'desc';
                                break;
                            case 1: // 구독자수 오름차순
                                sortColumn = 'subscriber_count';
                                sortDirection = 'asc';
                                break;
                            case 2: // 유효조회수백분률 내림차순
                                sortColumn = 'valid_view_rate';
                                sortDirection = 'desc';
                                break;
                            case 3: // 유효조회수백분률 오름차순
                                sortColumn = 'valid_view_rate';
                                sortDirection = 'asc';
                                break;
                        }
                        
                        console.log(`구독자수 정렬 상태: ${subscriberSortState}, 컬럼: ${sortColumn}, 방향: ${sortDirection}`);
                        updateSubscriberSortDisplay(th, subscriberSortState);
                        sortResults();
                        renderResults();
                    });
                }
                // 좋아요 컬럼 특별 처리
                else if (th.dataset.sort === 'likes') {
                    th.addEventListener('click', () => {
                        // 4단계 순환 토글
                        likesSortState = (likesSortState + 1) % 4;
                        
                        switch(likesSortState) {
                            case 0: // 좋아요개수 내림차순
                                sortColumn = 'like_count';
                                sortDirection = 'desc';
                                break;
                            case 1: // 좋아요개수 오름차순
                                sortColumn = 'like_count';
                                sortDirection = 'asc';
                                break;
                            case 2: // 좋아요백분율 내림차순
                                sortColumn = 'like_percentage';
                                sortDirection = 'desc';
                                break;
                            case 3: // 좋아요백분율 오름차순
                                sortColumn = 'like_percentage';
                                sortDirection = 'asc';
                                break;
                        }
                        
                        console.log(`좋아요 정렬 상태: ${likesSortState}, 컬럼: ${sortColumn}, 방향: ${sortDirection}`);
                        updateLikesSortDisplay(th, likesSortState);
                        sortResults();
                        renderResults();
                    });
                }
                // 국가 컬럼 특별 처리
                else if (th.dataset.sort === 'country') {
                    th.addEventListener('click', () => {
                        // 4단계 순환 토글
                        countrySortState = (countrySortState + 1) % 4;
                        
                        switch(countrySortState) {
                            case 0: // 국가이름 내림차순
                                sortColumn = 'country_name';
                                sortDirection = 'desc';
                                break;
                            case 1: // 국가이름 오름차순
                                sortColumn = 'country_name';
                                sortDirection = 'asc';
                                break;
                            case 2: // channel_total_rpm 내림차순
                                sortColumn = 'channel_total_rpm';
                                sortDirection = 'desc';
                                break;
                            case 3: // channel_total_rpm 오름차순
                                sortColumn = 'channel_total_rpm';
                                sortDirection = 'asc';
                                break;
                        }
                        
                        console.log(`국가 정렬 상태: ${countrySortState}, 컬럼: ${sortColumn}, 방향: ${sortDirection}`);
                        updateCountrySortDisplay(th, countrySortState);
                        sortResults();
                        renderResults();
                    });
                }
                // RPM 컬럼 특별 처리
                else if (th.dataset.sort === 'estimated_rpm') {
                    th.addEventListener('click', () => {
                        // 4단계 순환 토글
                        rpmSortState = (rpmSortState + 1) % 4;
                        
                        switch(rpmSortState) {
                            case 0: // rpm-estimate 내림차순
                                sortColumn = 'rpm_estimate';
                                sortDirection = 'desc';
                                break;
                            case 1: // rpm-estimate 오름차순
                                sortColumn = 'rpm_estimate';
                                sortDirection = 'asc';
                                break;
                            case 2: // rpm-total-value 내림차순
                                sortColumn = 'rpm_total_value';
                                sortDirection = 'desc';
                                break;
                            case 3: // rpm-total-value 오름차순
                                sortColumn = 'rpm_total_value';
                                sortDirection = 'asc';
                                break;
                        }
                        
                        console.log(`RPM 정렬 상태: ${rpmSortState}, 컬럼: ${sortColumn}, 방향: ${sortDirection}`);
                        updateRpmSortDisplay(th, rpmSortState);
                        sortResults();
                        renderResults();
                    });
                }
                // 재생시간 컬럼 특별 처리
                else if (th.dataset.sort === 'duration') {
                    th.addEventListener('click', () => {
                        // 4단계 순환 토글
                        durationSortState = (durationSortState + 1) % 4;
                        
                        switch(durationSortState) {
                            case 0: // duration-time 내림차순
                                sortColumn = 'duration_time';
                                sortDirection = 'desc';
                                break;
                            case 1: // duration-time 오름차순
                                sortColumn = 'duration_time';
                                sortDirection = 'asc';
                                break;
                            case 2: // duration-percentage 내림차순
                                sortColumn = 'duration_percentage';
                                sortDirection = 'desc';
                                break;
                            case 3: // duration-percentage 오름차순
                                sortColumn = 'duration_percentage';
                                sortDirection = 'asc';
                                break;
                        }
                        
                        console.log(`재생시간 정렬 상태: ${durationSortState}, 컬럼: ${sortColumn}, 방향: ${sortDirection}`);
                        updateDurationSortDisplay(th, durationSortState);
                        sortResults();
                        renderResults();
                    });
                }
                // 기존 방식: 다른 컬럼들
                else if (th.dataset.sort) {
                    th.addEventListener('click', () => {
                        const column = th.dataset.sort;
                        if (sortColumn === column) {
                            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                        } else {
                            sortColumn = column;
                            sortDirection = 'desc';
                        }
                        sortResults();
                        renderResults();
                    });
                }
            });

            // 새로운 방식: 개별 이모지 클릭 (채널명 컬럼)
            document.querySelectorAll('.sort-icon').forEach(icon => {
                icon.addEventListener('click', (e) => {
                    e.stopPropagation(); // 부모 th 클릭 이벤트 방지
                    const column = icon.dataset.sort;
                    console.log('Sort icon clicked:', column); // 디버깅용
                    if (sortColumn === column) {
                        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortColumn = column;
                        sortDirection = 'desc';
                    }
                    sortResults();
                    renderResults();
                });
            });
            
            // 자동완성 기능 초기화
            initializeAutocomplete();
            
            // 인기 검색어 로드
            loadTrendingKeywords();
            
            // UI 개선 기능 초기화
            initializeInfiniteScroll();
            initializeVideoPreview();
            initializeBookmarks();
            
        }
        
        // DOMContentLoaded 이벤트 (단일)
        document.addEventListener('DOMContentLoaded', initializeApp);
        
        // 카테고리 드롭다운 클릭 핸들러 함수
        function categoryDisplayClickHandler() {
            const dropdown = document.getElementById('categoryDropdown');
            if (dropdown) {
                dropdown.classList.toggle('show');
                console.log('카테고리 드롭다운 클릭됨, show 클래스:', dropdown.classList.contains('show'));
            }
        }
        
        // 카테고리 키보드 이벤트 핸들러
        function categoryDisplayKeyHandler(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                categoryDisplayClickHandler();
            }
        }

        // 그룹 체크박스 상태 업데이트
        function updateGroupCheckboxes() {
            const first2Checkboxes = ['shortForm1', 'shortForm2'];
            const next3Checkboxes = ['midForm1', 'midForm2', 'longForm1'];
            const top5Checkboxes = ['shortForm1', 'shortForm2', 'midForm1', 'midForm2', 'longForm1'];
            const bottom5Checkboxes = ['longForm2', 'longForm3', 'longForm4', 'longForm5', 'longForm6'];
            
            // 맨 앞 두 개 체크박스 상태 확인
            const first2CheckedCount = first2Checkboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectFirst2Checkbox = document.getElementById('selectFirst2VideoLength');
            if (first2CheckedCount === 0) {
                selectFirst2Checkbox.checked = false;
                selectFirst2Checkbox.indeterminate = false;
            } else if (first2CheckedCount === first2Checkboxes.length) {
                selectFirst2Checkbox.checked = true;
                selectFirst2Checkbox.indeterminate = false;
            } else {
                selectFirst2Checkbox.checked = false;
                selectFirst2Checkbox.indeterminate = true;
            }
            
            // 그 뒤 세 개 체크박스 상태 확인
            const next3CheckedCount = next3Checkboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectNext3Checkbox = document.getElementById('selectNext3VideoLength');
            if (next3CheckedCount === 0) {
                selectNext3Checkbox.checked = false;
                selectNext3Checkbox.indeterminate = false;
            } else if (next3CheckedCount === next3Checkboxes.length) {
                selectNext3Checkbox.checked = true;
                selectNext3Checkbox.indeterminate = false;
            } else {
                selectNext3Checkbox.checked = false;
                selectNext3Checkbox.indeterminate = true;
            }
            
            // 위 5개 체크박스 상태 확인
            const top5CheckedCount = top5Checkboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectTop5Checkbox = document.getElementById('selectTop5VideoLength');
            if (top5CheckedCount === 0) {
                selectTop5Checkbox.checked = false;
                selectTop5Checkbox.indeterminate = false;
            } else if (top5CheckedCount === top5Checkboxes.length) {
                selectTop5Checkbox.checked = true;
                selectTop5Checkbox.indeterminate = false;
            } else {
                selectTop5Checkbox.checked = false;
                selectTop5Checkbox.indeterminate = true;
            }
            
            // 밑 5개 체크박스 상태 확인
            const bottom5CheckedCount = bottom5Checkboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectBottom5Checkbox = document.getElementById('selectBottom5VideoLength');
            if (bottom5CheckedCount === 0) {
                selectBottom5Checkbox.checked = false;
                selectBottom5Checkbox.indeterminate = false;
            } else if (bottom5CheckedCount === bottom5Checkboxes.length) {
                selectBottom5Checkbox.checked = true;
                selectBottom5Checkbox.indeterminate = false;
            } else {
                selectBottom5Checkbox.checked = false;
                selectBottom5Checkbox.indeterminate = true;
            }
        }



        // 전역 변수는 이미 위에서 선언됨 (2505-2506라인)
        
        // 검색 시나리오 판별 함수
        function determineSearchScenario(selectedCountries) {
            // 국가가 선택되지 않았거나 전세계인 경우
            if (!selectedCountries || selectedCountries.length === 0 || 
                (selectedCountries.length === 1 && selectedCountries[0] === 'worldwide')) {
                return 'korea_only'; // 한국 기준으로 분석
            }
            
            // 한국만 선택된 경우
            if (selectedCountries.length === 1 && selectedCountries[0] === 'korea') {
                return 'korea_only';
            }
            
            // 다중 국가 선택 (외국+한국 또는 외국만)
            return 'foreign_korea_multi';
        }
        
        // 선택된 국가 가져오기 함수 (Single Choice)
        function getSelectedCountry() {
            const selectedRadio = document.querySelector('input[name="country"]:checked');
            return selectedRadio ? selectedRadio.value : 'korea'; // 기본값: 한국
        }
        
        // 기존 함수명 호환성을 위한 래퍼 함수
        function getSelectedCountries() {
            return [getSelectedCountry()];
        }
        
        // 시나리오에 따른 테이블 헤더 업데이트
        function updateTableHeaders() {
            const uploadDateHeader = document.getElementById('uploadDateHeader');
            const koreaTimeHeader = document.getElementById('koreaTimeHeader');
            
            // 모든 시나리오에서 한국시간 컬럼 표시 (이모지만 표시)
            koreaTimeHeader.style.display = 'table-cell';
            koreaTimeHeader.textContent = '🏠';
            
            // 업로드일 컬럼도 이모지만 표시
            uploadDateHeader.textContent = '🗓️';
        }
        
        // 국가 코드를 표시명으로 변환
        function getCountryDisplayName(countryCode) {
            const countryNames = {
                'korea': '한국',
                'usa': '미국',
                'japan': '일본',
                'china': '중국',
                'uk': '영국',
                'germany': '독일',
                'france': '프랑스',
                'canada': '캐나다',
                'australia': '호주',
                'india': '인도',
                'brazil': '브라질',
                'mexico': '멕시코',
                'russia': '러시아',
                'italy': '이탈리아',
                'spain': '스페인',
                'thailand': '태국',
                'vietnam': '베트남',
                'indonesia': '인도네시아',
                'argentina': '아르헨티나',
                'colombia': '콜롱비아',
                'saudi': '사우디아라비아',
                'uae': 'UAE',
                'southafrica': '남아프리카공화국',
                'nigeria': '나이지리아',
                'egypt': '이집트',
                'worldwide': '전세계'
            };
            return countryNames[countryCode] || countryCode;
        }
        
        // 날짜/시간 셀 생성 함수 (시나리오별 로직)
        function generateDateTimeCells(result, uploadDateObj) {
            if (currentSearchScenario === 'korea_only') {
                // 시나리오 1: 한국 단독 검색 - 업로드일과 한국시간 모두 한국시간 표시
                const koreaDateTime = formatDetailedDateTime(uploadDateObj, 'Asia/Seoul', 'KST');
                
                const uploadDateCell = `
                    <td>
                        <div class="upload-date detailed-time">
                            <div class="date-part">${koreaDateTime.dateOnly}</div>
                            <div class="time-part">${koreaDateTime.timeOnly}</div>
                        </div>
                    </td>`;
                
                const koreaTimeCell = `
                    <td>
                        <div class="upload-date detailed-time">
                            <div class="date-part">${koreaDateTime.dateOnly}</div>
                            <div class="time-part">${koreaDateTime.timeOnly}</div>
                        </div>
                    </td>`;
                
                return { uploadDateCell, koreaTimeCell };
            } else {
                // 시나리오 2: 외국+한국 다중 검색 - 듀얼 컬럼
                const isKoreanVideo = isVideoFromKorea(result);
                
                if (isKoreanVideo) {
                    // 한국 영상: 업로드일과 한국시간 모두 한국시간 표시
                    const koreaDateTime = formatDetailedDateTime(uploadDateObj, 'Asia/Seoul', 'KST');
                    
                    const uploadDateCell = `
                        <td>
                            <div class="upload-date detailed-time">
                                <div class="date-part">${koreaDateTime.dateOnly}</div>
                                <div class="time-part">${koreaDateTime.timeOnly}</div>
                            </div>
                        </td>`;
                    
                    const koreaTimeCell = `
                        <td>
                            <div class="upload-date detailed-time">
                                <div class="date-part">${koreaDateTime.dateOnly}</div>
                                <div class="time-part">${koreaDateTime.timeOnly}</div>
                            </div>
                        </td>`;
                    
                    return { uploadDateCell, koreaTimeCell };
                } else {
                    // 외국 영상: 업로드일에 현지시간, 한국시간에 변환된 시간
                    const detectedCountry = detectVideoCountry(result);
                    const countryCode = getCountryCodeFromName(detectedCountry);
                    const countryTimezone = getCountryTimezone(countryCode);
                    const timezoneAbbr = getTimezoneAbbr(countryCode);
                    
                    const localDateTime = formatDetailedDateTime(uploadDateObj, countryTimezone, timezoneAbbr);
                    const koreaDateTime = formatDetailedDateTime(uploadDateObj, 'Asia/Seoul', 'KST');
                    
                    const uploadDateCell = `
                        <td>
                            <div class="upload-date detailed-time">
                                <div class="date-part">${localDateTime.dateOnly}</div>
                                <div class="time-part">${localDateTime.timeOnly}</div>
                            </div>
                        </td>`;
                    
                    const koreaTimeCell = `
                        <td>
                            <div class="upload-date detailed-time">
                                <div class="date-part">${koreaDateTime.dateOnly}</div>
                                <div class="time-part">${koreaDateTime.timeOnly}</div>
                            </div>
                        </td>`;
                    
                    return { uploadDateCell, koreaTimeCell };
                }
            }
        }
        
        // 국가별 타임존 가져오기
        function getCountryTimezone(countryCode) {
            const countryTimezones = {
                'usa': 'America/New_York',
                'uk': 'Europe/London', 
                'germany': 'Europe/Berlin',
                'france': 'Europe/Paris',
                'japan': 'Asia/Tokyo',
                'china': 'Asia/Shanghai',
                'australia': 'Australia/Sydney',
                'india': 'Asia/Kolkata',
                'brazil': 'America/Sao_Paulo',
                'canada': 'America/Toronto',
                'mexico': 'America/Mexico_City',
                'russia': 'Europe/Moscow',
                'italy': 'Europe/Rome',
                'spain': 'Europe/Madrid',
                'israel': 'Asia/Jerusalem',
                'korea': 'Asia/Seoul',
                // 누락된 34개국 추가
                'newzealand': 'Pacific/Auckland',
                'switzerland': 'Europe/Zurich',
                'norway': 'Europe/Oslo',
                'ireland': 'Europe/Dublin',
                'netherlands': 'Europe/Amsterdam',
                'denmark': 'Europe/Copenhagen',
                'hongkong': 'Asia/Hong_Kong',
                'sweden': 'Europe/Stockholm',
                'finland': 'Europe/Helsinki',
                'singapore': 'Asia/Singapore',
                'austria': 'Europe/Vienna',
                'luxembourg': 'Europe/Luxembourg',
                'belgium': 'Europe/Brussels',
                'czechrepublic': 'Europe/Prague',
                'portugal': 'Europe/Lisbon',
                'uae': 'Asia/Dubai',
                'qatar': 'Asia/Qatar',
                'kuwait': 'Asia/Kuwait',
                'saudi': 'Asia/Riyadh',
                'poland': 'Europe/Warsaw',
                'southafrica': 'Africa/Johannesburg',
                'turkey': 'Europe/Istanbul',
                'hungary': 'Europe/Budapest',
                'suriname': 'America/Paramaribo',
                'colombia': 'America/Bogota',
                'argentina': 'America/Argentina/Buenos_Aires',
                'mozambique': 'Africa/Maputo',
                'indonesia': 'Asia/Jakarta',
                'vietnam': 'Asia/Ho_Chi_Minh',
                'pakistan': 'Asia/Karachi',
                'bangladesh': 'Asia/Dhaka',
                'jamaica': 'America/Jamaica',
                'libya': 'Africa/Tripoli',
                'iceland': 'Atlantic/Reykjavik',
                'srilanka': 'Asia/Colombo'
            };
            
            return countryTimezones[countryCode] || 'UTC';
        }
        
        // 한국 영상 식별 함수 (개선된 버전)
        function isVideoFromKorea(result) {
            const channelName = result.youtube_channel_name || '';
            const title = result.title || '';
            const description = result.description || '';
            
            // 한글 패턴 (자음, 모음, 완성형 한글)
            const koreanRegex = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
            
            // 1단계: 채널명에 한글이 많이 포함된 경우 (우선순위 높음)
            const channelKoreanCount = (channelName.match(/[가-힣]/g) || []).length;
            const channelTotalLength = channelName.length;
            
            if (channelTotalLength > 0) {
                const channelKoreanRatio = channelKoreanCount / channelTotalLength;
                // 채널명의 30% 이상이 한글이면 한국 채널로 판별
                if (channelKoreanRatio >= 0.3) {
                    return true;
                }
            }
            
            // 2단계: 제목에 한글이 많이 포함된 경우
            const titleKoreanCount = (title.match(/[가-힣]/g) || []).length;
            const titleTotalLength = title.replace(/\s+/g, '').length; // 공백 제외한 길이
            
            if (titleTotalLength > 0) {
                const titleKoreanRatio = titleKoreanCount / titleTotalLength;
                // 제목의 50% 이상이 한글이면 한국 영상으로 판별 (채널명보다 높은 기준)
                if (titleKoreanRatio >= 0.5) {
                    return true;
                }
            }
            
            // 3단계: 외국 채널인지 우선 확인 (영어권 채널명 패턴)
            const foreignChannelPatterns = [
                /\b(news|media|tv|channel|network|broadcasting|press)\b/i,
                /\b(gaming|game|play|stream|live)\b/i,
                /\b(military|defense|aviation|air force|navy)\b/i,
                /\b(official|productions|studios|entertainment)\b/i
            ];
            
            const isLikelyForeignChannel = foreignChannelPatterns.some(pattern => 
                pattern.test(channelName)
            );
            
            // 4단계: 외국 채널로 추정되면서 한글 비율이 낮으면 외국 영상으로 판별
            if (isLikelyForeignChannel) {
                const combinedText = channelName + ' ' + title;
                const combinedKoreanCount = (combinedText.match(/[가-힣]/g) || []).length;
                const combinedTotalLength = combinedText.replace(/\s+/g, '').length;
                
                if (combinedTotalLength > 0) {
                    const combinedKoreanRatio = combinedKoreanCount / combinedTotalLength;
                    // 전체 텍스트에서 한글 비율이 20% 미만이면 외국 영상
                    if (combinedKoreanRatio < 0.2) {
                        return false;
                    }
                }
            }
            
            // 5단계: 기본 fallback - 한글이 있으면 한국 영상 (기존 로직)
            return koreanRegex.test(channelName) || koreanRegex.test(title);
        }
        
        // 브랜드 채널 감지 함수
        function isBrandChannel(result) {
            const channelName = result.youtube_channel_name || '';
            const subscriberCount = parseInt(result.subscriber_count) || 0;
            
            // 구독자 수가 100만 이상이면 브랜드 채널로 판별
            if (subscriberCount >= 1000000) {
                return true;
            }
            
            // 특정 키워드가 포함된 경우 브랜드 채널로 판별
            const brandKeywords = [
                'official', 'entertainment', 'music', 'news', 'media',
                'tv', 'channel', 'network', 'studios', 'productions',
                '공식', '엔터테인먼트', '뮤직', '뉴스', '미디어'
            ];
            
            const lowerChannelName = channelName.toLowerCase();
            return brandKeywords.some(keyword => lowerChannelName.includes(keyword));
        }
        
        // 영상의 국가 정보 감지 함수
        function detectVideoCountry(result) {
            // 1. 한글 패턴으로 한국 영상 우선 판별
            const isKorean = isVideoFromKorea(result);
            
            // 디버깅을 위한 로그 (개발용)
            if (result.title && (result.title.toLowerCase().includes('kf') || result.title.toLowerCase().includes('미국'))) {
                console.log('🔍 국가 감지 디버그:', {
                    title: result.title.substring(0, 50) + '...',
                    channel: result.youtube_channel_name,
                    isKorean: isKorean,
                    detected: isKorean ? '한국' : '외국'
                });
            }
            
            if (isKorean) {
                return '한국';
            }
            
            // 2. 주요 언어별 국가 추정
            const channelName = result.youtube_channel_name || '';
            const title = result.title || '';
            const combined = (channelName + ' ' + title).toLowerCase();
            
            // 일본어 패턴 (히라가나, 가타카나, 한자)
            if (/[぀-ゟ゠-ヿ一-龯]/.test(combined)) {
                return '일본';
            }
            
            // 중국어 간체자 패턴
            if (/[一-鿿]/.test(combined) && !/[぀-ゟ゠-ヿ]/.test(combined)) {
                return '중국';
            }
            
            // 영어권 국가 키워드 기반 추정
            const countryKeywords = {
                '미국': ['usa', 'america', 'american', 'united states'],
                '영국': ['uk', 'britain', 'british', 'england', 'london'],
                '캐나다': ['canada', 'canadian', 'toronto', 'vancouver'],
                '호주': ['australia', 'australian', 'sydney', 'melbourne'],
                '독일': ['germany', 'german', 'deutschland', 'berlin'],
                '프랑스': ['france', 'french', 'paris'],
                '이탈리아': ['italy', 'italian', 'rome'],
                '스페인': ['spain', 'spanish', 'madrid'],
                '브라질': ['brazil', 'brazilian', 'portuguese'],
                '멕시코': ['mexico', 'mexican'],
                '인도': ['india', 'indian', 'hindi'],
                '태국': ['thailand', 'thai', 'bangkok'],
                '베트남': ['vietnam', 'vietnamese'],
                '인도네시아': ['indonesia', 'indonesian'],
                // 추가 35개국 (50개국 지원)
                '뉴질랜드': ['newzealand', 'new zealand', 'auckland', 'wellington'],
                '스위스': ['switzerland', 'swiss', 'zurich', 'geneva'],
                '노르웨이': ['norway', 'norwegian', 'oslo'],
                '아일랜드': ['ireland', 'irish', 'dublin'],
                '네덜란드': ['netherlands', 'dutch', 'amsterdam', 'holland'],
                '덴마크': ['denmark', 'danish', 'copenhagen'],
                '홍콩': ['hongkong', 'hong kong', 'hk'],
                '스웨덴': ['sweden', 'swedish', 'stockholm'],
                '핀란드': ['finland', 'finnish', 'helsinki'],
                '싱가포르': ['singapore', 'singaporean'],
                '오스트리아': ['austria', 'austrian', 'vienna'],
                '룩셈부르크': ['luxembourg'],
                '벨기에': ['belgium', 'belgian', 'brussels'],
                '체코': ['czech', 'czechrepublic', 'prague'],
                '이스라엘': ['israel', 'israeli', 'tel aviv', 'jerusalem'],
                '포르투갈': ['portugal', 'portuguese', 'lisbon'],
                '아랍에미리트': ['uae', 'emirates', 'dubai', 'abu dhabi'],
                '카타르': ['qatar', 'doha'],
                '쿠웨이트': ['kuwait'],
                '사우디아라비아': ['saudi', 'saudi arabia', 'riyadh'],
                '폴란드': ['poland', 'polish', 'warsaw'],
                '남아프리카공화국': ['south africa', 'southafrica', 'cape town'],
                '터키': ['turkey', 'turkish', 'istanbul'],
                '헝가리': ['hungary', 'hungarian', 'budapest'],
                '수리남': ['suriname'],
                '콜롱비아': ['colombia', 'colombian', 'bogota'],
                '아르헨티나': ['argentina', 'argentinian', 'buenos aires'],
                '모잠비크': ['mozambique'],
                '파키스탄': ['pakistan', 'pakistani', 'karachi'],
                '방글라데시': ['bangladesh', 'bangladeshi', 'dhaka'],
                '자메이카': ['jamaica', 'jamaican', 'kingston'],
                '리비아': ['libya', 'libyan', 'tripoli'],
                '아이슬란드': ['iceland', 'icelandic', 'reykjavik'],
                '스리랑카': ['sri lanka', 'srilanka', 'colombo']
            };
            
            for (const [country, keywords] of Object.entries(countryKeywords)) {
                for (const keyword of keywords) {
                    if (combined.includes(keyword)) {
                        return country;
                    }
                }
            }
            
            // 기본값: 검색 기준 국가 또는 미분류
            if (currentSearchScenario === 'korea_only') {
                return '한국';
            } else {
                const countryDisplayName = getCountryDisplayName(primarySearchCountry);
                return countryDisplayName !== primarySearchCountry ? countryDisplayName : '미분류';
            }
        }
        
        // 한국어 국가명을 영어 코드로 변환
        function getCountryCodeFromName(countryName) {
            const countryCodeMap = {
                '한국': 'korea',
                '미국': 'usa', 
                '일본': 'japan',
                '중국': 'china',
                '영국': 'uk',
                '캐나다': 'canada',
                '호주': 'australia',
                '독일': 'germany',
                '프랑스': 'france',
                '이탈리아': 'italy',
                '스페인': 'spain',
                '브라질': 'brazil',
                '멕시코': 'mexico',
                '인도': 'india',
                '태국': 'thailand',
                '베트남': 'vietnam',
                '인도네시아': 'indonesia',
                '뉴질랜드': 'newzealand',
                '스위스': 'switzerland',
                '노르웨이': 'norway',
                '아일랜드': 'ireland',
                '네덜란드': 'netherlands',
                '덴마크': 'denmark',
                '홍콩': 'hongkong',
                '스웨덴': 'sweden',
                '핀란드': 'finland',
                '싱가포르': 'singapore',
                '오스트리아': 'austria',
                '룩셈부르크': 'luxembourg',
                '벨기에': 'belgium',
                '체코': 'czech',
                '이스라엘': 'israel',
                '포르투갈': 'portugal',
                '아랍에미리트': 'uae',
                '카타르': 'qatar',
                '쿠웨이트': 'kuwait',
                '사우디아라비아': 'saudi',
                '폴란드': 'poland',
                '남아프리카공화국': 'southafrica',
                '터키': 'turkey',
                '헝가리': 'hungary',
                '수리남': 'suriname',
                '콜롬비아': 'colombia',
                '아르헨티나': 'argentina',
                '모잠비크': 'mozambique',
                '파키스탄': 'pakistan',
                '방글라데시': 'bangladesh',
                '자메이카': 'jamaica',
                '리비아': 'libya',
                '아이슬란드': 'iceland',
                '스리랑카': 'srilanka'
            };
            
            return countryCodeMap[countryName] || 'usa'; // 기본값은 미국
        }
        
        // 국가별 시간대 변환
        function convertToCountryTime(utcDate, countryCode) {
            // 국가별 시간대 매핑 (기존 analyzeUploadTime 함수에서 사용하던 매핑 활용)
            const countryTimezones = {
                'usa': 'America/New_York',
                'uk': 'Europe/London', 
                'germany': 'Europe/Berlin',
                'france': 'Europe/Paris',
                'japan': 'Asia/Tokyo',
                'china': 'Asia/Shanghai',
                'australia': 'Australia/Sydney',
                'india': 'Asia/Kolkata',
                'brazil': 'America/Sao_Paulo',
                'canada': 'America/Toronto',
                'mexico': 'America/Mexico_City',
                'russia': 'Europe/Moscow',
                'italy': 'Europe/Rome',
                'spain': 'Europe/Madrid',
                'israel': 'Asia/Jerusalem',
                // 누락된 34개국 추가
                'newzealand': 'Pacific/Auckland',
                'switzerland': 'Europe/Zurich',
                'norway': 'Europe/Oslo',
                'ireland': 'Europe/Dublin',
                'netherlands': 'Europe/Amsterdam',
                'denmark': 'Europe/Copenhagen',
                'hongkong': 'Asia/Hong_Kong',
                'sweden': 'Europe/Stockholm',
                'finland': 'Europe/Helsinki',
                'singapore': 'Asia/Singapore',
                'austria': 'Europe/Vienna',
                'luxembourg': 'Europe/Luxembourg',
                'belgium': 'Europe/Brussels',
                'czechrepublic': 'Europe/Prague',
                'portugal': 'Europe/Lisbon',
                'uae': 'Asia/Dubai',
                'qatar': 'Asia/Qatar',
                'kuwait': 'Asia/Kuwait',
                'saudi': 'Asia/Riyadh',
                'poland': 'Europe/Warsaw',
                'southafrica': 'Africa/Johannesburg',
                'turkey': 'Europe/Istanbul',
                'hungary': 'Europe/Budapest',
                'suriname': 'America/Paramaribo',
                'colombia': 'America/Bogota',
                'argentina': 'America/Argentina/Buenos_Aires',
                'mozambique': 'Africa/Maputo',
                'indonesia': 'Asia/Jakarta',
                'vietnam': 'Asia/Ho_Chi_Minh',
                'pakistan': 'Asia/Karachi',
                'bangladesh': 'Asia/Dhaka',
                'jamaica': 'America/Jamaica',
                'libya': 'Africa/Tripoli',
                'iceland': 'Atlantic/Reykjavik',
                'srilanka': 'Asia/Colombo'
            };
            
            const timezone = countryTimezones[countryCode] || 'UTC';
            const localDate = new Date(utcDate.toLocaleString("en-US", {timeZone: timezone}));
            
            return {
                year: localDate.getFullYear(),
                monthDay: localDate.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
            };
        }
        
        // 한국 시간대로 변환
        function convertToKoreaTime(utcDate) {
            const koreaDate = new Date(utcDate.toLocaleString("en-US", {timeZone: 'Asia/Seoul'}));
            
            return {
                year: koreaDate.getFullYear(),
                monthDay: koreaDate.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
            };
        }
        
        // 상세 시간 형식 생성 (2025.08.26 TUE 09:30 KST)
        function formatDetailedDateTime(date, timezone, timezoneAbbr) {
            const localDate = new Date(date.toLocaleString("en-US", {timeZone: timezone}));
            
            const year = localDate.getFullYear();
            const month = String(localDate.getMonth() + 1).padStart(2, '0');
            const day = String(localDate.getDate()).padStart(2, '0');
            const hours = String(localDate.getHours()).padStart(2, '0');
            const minutes = String(localDate.getMinutes()).padStart(2, '0');
            
            const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const dayOfWeek = dayNames[localDate.getDay()];
            
            // HTML 구조로 시간 표시 (MON, KST는 black-bold, 14:30만 red-bold)
            const timeOnlyHTML = `<span class="time-display"><span class="weekday-bold">${dayOfWeek}</span> <span class="time-red-bold">${hours}:${minutes}</span> <span class="timezone-bold">${timezoneAbbr}</span></span>`;
            
            // 디버깅용 로그
            console.log('🕰️ 시간 HTML 생성:', timeOnlyHTML);
            
            return {
                dateOnly: `${year}.${month}.${day}`,
                timeOnly: timeOnlyHTML,
                timeOnlyText: `${dayOfWeek} ${hours}:${minutes} ${timezoneAbbr}`, // 텍스트만 필요한 경우
                fullDateTime: `${year}.${month}.${day} ${dayOfWeek} ${hours}:${minutes} ${timezoneAbbr}`
            };
        }
        
        // 국가별 시간대 약어 매핑
        function getTimezoneAbbr(countryCode) {
            const timezoneAbbrs = {
                'usa': 'EST',
                'uk': 'GMT', 
                'germany': 'CET',
                'france': 'CET',
                'japan': 'JST',
                'china': 'CST',
                'australia': 'AEDT',
                'india': 'IST',
                'brazil': 'BRT',
                'canada': 'EST',
                'mexico': 'CST',
                'russia': 'MSK',
                'italy': 'CET',
                'spain': 'CET',
                'israel': 'IST',
                'korea': 'KST',
                // 누락된 34개국 시간대 약어 추가
                'newzealand': 'NZDT',
                'switzerland': 'CET',
                'norway': 'CET',
                'ireland': 'GMT',
                'netherlands': 'CET',
                'denmark': 'CET',
                'hongkong': 'HKT',
                'sweden': 'CET',
                'finland': 'EET',
                'singapore': 'SGT',
                'austria': 'CET',
                'luxembourg': 'CET',
                'belgium': 'CET',
                'czechrepublic': 'CET',
                'portugal': 'WET',
                'uae': 'GST',
                'qatar': 'AST',
                'kuwait': 'AST',
                'saudi': 'AST',
                'poland': 'CET',
                'southafrica': 'SAST',
                'turkey': 'TRT',
                'hungary': 'CET',
                'suriname': 'SRT',
                'colombia': 'COT',
                'argentina': 'ART',
                'mozambique': 'CAT',
                'indonesia': 'WIB',
                'vietnam': 'ICT',
                'pakistan': 'PKT',
                'bangladesh': 'BST',
                'jamaica': 'EST',
                'libya': 'EET',
                'iceland': 'GMT',
                'srilanka': 'LKT'
            };
            
            return timezoneAbbrs[countryCode] || 'UTC';
        }

        // 검색 수행 함수
        async function performSearch() {
            const formData = new FormData(document.getElementById('searchForm'));
            const searchParams = new URLSearchParams();
            
            // 검색 시나리오 판별 로직
            const selectedCountries = getSelectedCountries();
            currentSearchScenario = determineSearchScenario(selectedCountries);
            primarySearchCountry = selectedCountries.length > 0 ? selectedCountries[0] : 'korea';
            
            console.log(`🎯 검색 시나리오: ${currentSearchScenario}`);
            console.log(`🗺️ 기준 국가: ${primarySearchCountry}`);
            
            // 테이블 헤더 업데이트
            updateTableHeaders();

            // 폼 데이터 처리
            for (let [key, value] of formData.entries()) {
                if (key === 'videoLength') {
                    // 체크박스 처리는 별도로
                    continue;
                }
                if (value) {
                    searchParams.append(key, value);
                }
            }

            // 동의어 제한값 추가
            const synonymLimit = document.getElementById('synonymLimit').value;
            if (synonymLimit !== '') {
                searchParams.append('synonymLimit', synonymLimit);
            }

            // 날짜 범위 처리
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            
            // 날짜 유효성 검증
            let validStartDate = null;
            let validEndDate = null;
            
            if (startDate) {
                try {
                    const testDate = new Date(startDate);
                    if (!isNaN(testDate.getTime()) && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        validStartDate = startDate;
                        searchParams.append('startDate', startDate);
                        console.log('✅ 클라이언트: 시작일 유효성 검증 통과:', startDate);
                    } else {
                        console.warn('⚠️ 클라이언트: 시작일 형식이 올바르지 않음:', startDate);
                    }
                } catch (error) {
                    console.error('❌ 클라이언트: 시작일 검증 오류:', error.message);
                }
            }
            
            if (endDate) {
                try {
                    const testDate = new Date(endDate);
                    if (!isNaN(testDate.getTime()) && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        validEndDate = endDate;
                        searchParams.append('endDate', endDate);
                        console.log('✅ 클라이언트: 종료일 유효성 검증 통과:', endDate);
                    } else {
                        console.warn('⚠️ 클라이언트: 종료일 형식이 올바르지 않음:', endDate);
                    }
                } catch (error) {
                    console.error('❌ 클라이언트: 종료일 검증 오류:', error.message);
                }
            }
            
            // 날짜 순서 검증
            if (validStartDate && validEndDate) {
                const start = new Date(validStartDate);
                const end = new Date(validEndDate);
                if (start > end) {
                    console.warn('⚠️ 시작일이 종료일보다 늦습니다. 날짜를 확인해주세요.');
                    alert('시작일이 종료일보다 늦습니다. 날짜를 확인해주세요.');
                    return;
                }
            }
            
            console.log('📅 날짜 범위 디버그:', {
                원본_startDate: startDate || '없음',
                원본_endDate: endDate || '없음',
                유효한_startDate: validStartDate || '없음',
                유효한_endDate: validEndDate || '없음',
                hasDateRange: !!(validStartDate || validEndDate)
            });

            // 비디오 길이 체크박스 처리
            const shortForm1 = document.getElementById('shortForm1').checked;
            const shortForm2 = document.getElementById('shortForm2').checked;
            const midForm1 = document.getElementById('midForm1').checked;
            const midForm2 = document.getElementById('midForm2').checked;
            const longForm1 = document.getElementById('longForm1').checked;
            const longForm2 = document.getElementById('longForm2').checked;
            const longForm3 = document.getElementById('longForm3').checked;
            const longForm4 = document.getElementById('longForm4').checked;
            const longForm5 = document.getElementById('longForm5').checked;
            const longForm6 = document.getElementById('longForm6').checked;
            
            const selectedLengths = [];
            if (shortForm1) selectedLengths.push('short1');
            if (shortForm2) selectedLengths.push('short2');
            if (midForm1) selectedLengths.push('mid1');
            if (midForm2) selectedLengths.push('mid2');
            if (longForm1) selectedLengths.push('long1');
            if (longForm2) selectedLengths.push('long2');
            if (longForm3) selectedLengths.push('long3');
            if (longForm4) selectedLengths.push('long4');
            if (longForm5) selectedLengths.push('long5');
            if (longForm6) selectedLengths.push('long6');
            
            // 동영상 길이 파라미터 (빈 배열이어도 전송)
            console.log('🎬 동영상 길이 디버그:', {
                selectedLengths: selectedLengths,
                lengthCount: selectedLengths.length,
                joinedString: selectedLengths.join(','),
                willSend: selectedLengths.join(',') || '빈 문자열'
            });
            searchParams.append('videoLength', selectedLengths.join(','));

            // 카테고리 체크박스 처리
            const selectedCategories = [];
            document.querySelectorAll('input[name="categories"]:checked').forEach(checkbox => {
                selectedCategories.push(checkbox.value);
            });
            
            console.log('📚 카테고리 디버그:', {
                selectedCategories: selectedCategories,
                categoryCount: selectedCategories.length,
                joinedString: selectedCategories.join(','),
                willSend: selectedCategories.join(',') || '빈 문자열'
            });
            searchParams.append('categories', selectedCategories.join(','));

            // 검색 범위 체크박스 처리
            const selectedSearchScope = [];
            document.querySelectorAll('input[name="searchScope"]:checked').forEach(checkbox => {
                selectedSearchScope.push(checkbox.value);
            });
            
            console.log('🔍 검색 범위 디버그:', {
                selectedSearchScope: selectedSearchScope,
                scopeCount: selectedSearchScope.length,
                joinedString: selectedSearchScope.join(','),
                willSend: selectedSearchScope.join(',') || '빈 문자열'
            });
            searchParams.append('searchScope', selectedSearchScope.join(','));

            // 키워드 확인 및 안내 메시지
            const keyword = document.getElementById('keyword').value;
            // 국가 라디오 버튼 처리 (Single Choice)
            const selectedCountry = getSelectedCountry();
            
            console.log('🌍 선택된 국가:', selectedCountry);
            searchParams.append('countries', selectedCountry);

            // 시간대 필터는 결과내 재검색으로 구현됨 (서버 전송 불필요)
            const isEmptyKeyword = !keyword || !keyword.trim();
            
            console.log('=== 클라이언트 검색 요청 디버그 ===');
            console.log('🌍 선택된 국가:', selectedCountry);
            console.log('🔍 입력된 키워드:', keyword || '없음');
            console.log('📋 검색 파라미터:', searchParams.toString());
            console.log('===========================');
            
            if (isEmptyKeyword) {
                console.log('키워드 없음: 국가별 인기 동영상 검색 모드');
                if (selectedCountries.includes('worldwide')) {
                    showInfo('🔥 키워드가 없어서 전세계 조회수가 높은 인기 동영상들을 검색합니다.');
                } else {
                    showInfo(`🔥 키워드가 없어서 ${selectedCountries.length}개 국가의 인기 동영상들을 검색합니다.`);
                }
            } else {
                console.log(`키워드 검색: "${keyword.trim()}"`);
            }

            // UI 상태 업데이트
            showLoading();
            hideError();
            hideResults();

            try {
                const response = await fetch(`/api/search?${searchParams.toString()}`);
                const data = await response.json();

                hideLoading();

                                 if (data.success) {
                     // ✅ 새 검색 시 모든 필터 관련 변수 완전 초기화
                     searchResults = data.data;
                     allSearchResults = [...data.data]; // 원본 검색 결과 저장
                     filteredResults = [...data.data]; // 필터링된 결과 초기화
                     currentTimezoneFilter = {}; // 필터 상태 초기화
                     
                     // ✅ 새로운 검색 시 결과 표시를 일반 모드로 초기화
                     const totalResultsInfo = document.getElementById('totalResultsInfo');
                     if (totalResultsInfo) {
                         totalResultsInfo.style.display = 'none'; // X/Y 형태 숨기기
                     }
                     currentPage = 1;
                     
                     // 검색 시마다 정렬을 조회수 내림차순으로 초기화
                     sortColumn = 'daily_view_count';
                     sortDirection = 'desc';
                     
                     sortResults();
                     renderResults();
                     showResults();
                    
                    // 시간대 분석 및 필터 표시
                    if (searchResults.length > 0) {
                    analyzeSearchResults(searchResults);
                    }
                    
                    // Excel 다운로드 버튼 표시
                    showExcelDownloadButton();
                     
                     // 중복 제거 정보 표시 (콘솔에만)
                     console.log(`✅ 검색 완료: ${searchResults.length}개 고유 결과`);
                 } else {
                    // 오류 타입별 처리
                    if (data.errorType === 'quota_exceeded') {
                        showError(`
                            <div style="text-align: center;">
                                <h3>🚫 YouTube API 할당량 초과</h3>
                                <p><strong>${data.error}</strong></p>
                                <div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 8px; font-size: 0.9em;">
                                    ${data.details}
                                </div>
                                <div style="margin-top: 15px;">
                                    <p><strong>해결 방법:</strong></p>
                                    <ul style="text-align: left; display: inline-block;">
                                        <li>내일 다시 시도해주세요 (할당량 자동 재설정)</li>
                                        <li>관리자에게 API 키 추가 요청</li>
                                        <li>검색 범위를 줄여서 재시도</li>
                                    </ul>
                                </div>
                            </div>
                        `);
                    } else if (data.errorType === 'invalid_api_key') {
                        showError(`
                            <div style="text-align: center;">
                                <h3>🔑 API 키 오류</h3>
                                <p><strong>${data.error}</strong></p>
                                <div style="margin-top: 15px;">
                                    <p>관리자가 .env 파일의 YOUTUBE_API_KEY를 확인해야 합니다.</p>
                                </div>
                            </div>
                        `);
                    } else {
                        showError(data.error || '검색 중 오류가 발생했습니다.');
                    }
                }
            } catch (error) {
                hideLoading();
                showError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
                console.error('검색 오류:', error);
            }
        }

        // 정렬 함수
        function sortResults() {
            searchResults.sort((a, b) => {
                let aVal = a[sortColumn];
                let bVal = b[sortColumn];

                // 숫자 값 처리
                if (sortColumn === 'daily_view_count' || sortColumn === 'subscriber_count') {
                    aVal = parseInt(aVal) || 0;
                    bVal = parseInt(bVal) || 0;
                }

                // 유효조회수 처리 (서버에서 계산된 값 사용)
                if (sortColumn === 'valid_view_count') {
                    aVal = parseInt(a.valid_view_count) || 0;
                    bVal = parseInt(b.valid_view_count) || 0;
                }

                // 유효조회수 백분률 처리 (서버에서 계산된 값 사용)
                if (sortColumn === 'valid_view_rate') {
                    aVal = parseFloat(a.valid_view_percentage) || 0;
                    bVal = parseFloat(b.valid_view_percentage) || 0;
                }

                // 동영상 시간 처리
                if (sortColumn === 'duration') {
                    aVal = parseInt(a.duration_seconds) || 0;
                    bVal = parseInt(b.duration_seconds) || 0;
                }

                // duration-time 정렬 처리 (4단계 토글용)
                if (sortColumn === 'duration_time') {
                    aVal = parseInt(a.duration_seconds) || 0;
                    bVal = parseInt(b.duration_seconds) || 0;
                }

                // duration-percentage 정렬 처리 (4단계 토글용)
                if (sortColumn === 'duration_percentage') {
                    // 서버에서 계산된 평균시청률 백분율 사용
                    aVal = parseFloat(a.avg_watch_rate_percentage) || 0;
                    bVal = parseFloat(b.avg_watch_rate_percentage) || 0;
                }

                // 좋아요개수 처리 (서버에서 계산된 값 사용)
                if (sortColumn === 'like_count') {
                    aVal = parseInt(a.like_count) || 0;
                    bVal = parseInt(b.like_count) || 0;
                }

                // 좋아요백분율 처리 (서버에서 계산된 값 사용)
                if (sortColumn === 'like_percentage') {
                    aVal = parseFloat(a.like_percentage) || 0;
                    bVal = parseFloat(b.like_percentage) || 0;
                }

                // 날짜 값 처리
                if (sortColumn === 'status_date') {
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                }

                // 한국시간 정렬 처리
                if (sortColumn === 'korea_time') {
                    aVal = new Date(a.status_date);
                    bVal = new Date(b.status_date);
                }

                // 국가 정렬 처리
                if (sortColumn === 'country') {
                    aVal = detectVideoCountry(a);
                    bVal = detectVideoCountry(b);
                }

                // 국가이름 정렬 처리 (4단계 토글용)
                if (sortColumn === 'country_name') {
                    aVal = detectVideoCountry(a);
                    bVal = detectVideoCountry(b);
                }

                // channel_total_rpm 정렬 처리 (4단계 토글용)
                if (sortColumn === 'channel_total_rpm') {
                    aVal = parseFloat(a.channel_total_rpm) || 0;
                    bVal = parseFloat(b.channel_total_rpm) || 0;
                }

                // 채널 개설일 정렬 처리
                if (sortColumn === 'channel_created_date') {
                    aVal = a.channel_created_date ? new Date(a.channel_created_date) : new Date(0);
                    bVal = b.channel_created_date ? new Date(b.channel_created_date) : new Date(0);
                }

                // RPM 정렬 처리 (재생+광고 RPM 합산값 기준)
                if (sortColumn === 'estimated_rpm') {
                    const aRpm = parseFloat(a.estimated_rpm) || 0;
                    const bRpm = parseFloat(b.estimated_rpm) || 0;
                    aVal = aRpm + (aRpm * 0.85);
                    bVal = bRpm + (bRpm * 0.85);
                }

                // rpm-estimate 정렬 처리 (4단계 토글용)
                if (sortColumn === 'rpm_estimate') {
                    aVal = parseFloat(a.estimated_rpm) || 0;
                    bVal = parseFloat(b.estimated_rpm) || 0;
                }

                // rpm-total-value 정렬 처리 (4단계 토글용)
                if (sortColumn === 'rpm_total_value') {
                    const aRpm = parseFloat(a.estimated_rpm) || 0;
                    const bRpm = parseFloat(b.estimated_rpm) || 0;
                    aVal = aRpm + (aRpm * 0.85);
                    bVal = bRpm + (bRpm * 0.85);
                }

                // 채널 재생누적 RPM 정렬 처리
                if (sortColumn === 'channel_playback_rpm') {
                    aVal = parseFloat(a.channel_playback_rpm) || 0;
                    bVal = parseFloat(b.channel_playback_rpm) || 0;
                }

                // 문자열 값 처리
                if (typeof aVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }

                if (sortDirection === 'asc') {
                    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                } else {
                    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
                }
            });
        }

        // 결과 렌더링 함수
        function renderResults() {
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageResults = searchResults.slice(startIndex, endIndex);

            const tbody = document.getElementById('resultsTableBody');
            tbody.innerHTML = '';

            if (pageResults.length === 0) {
                // 모든 시나리오에서 12개 컬럼 사용 (국가 컬럼 추가로 인해)
                tbody.innerHTML = `
                    <tr>
                        <td colspan="14" class="no-results">
                            <h3>검색 결과가 없습니다</h3>
                            <p>다른 검색 조건으로 시도해보세요.</p>
                        </td>
                    </tr>
                `;
                return;
            }

            pageResults.forEach(result => {
                const row = document.createElement('tr');
                
                const uploadDateObj = new Date(result.status_date);
                const viewCount = formatViewCount(result.daily_view_count);
                const subscriberCount = formatSubscriberCount(result.subscriber_count || 0);
                const formattedDuration = formatDuration(result.duration_seconds);
                
                // 시나리오별 날짜/시간 표시 로직
                const { uploadDateCell, koreaTimeCell } = generateDateTimeCells(result, uploadDateObj);
                
                // 국가 정보 감지
                const countryName = detectVideoCountry(result);
                
                row.innerHTML = `
                    <td>
                        <img src="${result.thumbnail_url}" alt="썸네일" class="thumbnail">
                    </td>
                    <td>
                        <a href="https://www.youtube.com/channel/${result.youtube_channel_id}" target="_blank" class="channel-link" title="${result.youtube_channel_name} 채널 홈으로 이동">
                            <div class="channel-name${isBrandChannel(result) ? ' brand-channel' : ''}">
                                ${result.youtube_channel_name}
                                <div class="channel-created-date">
                                    📅 ${formatChannelCreatedDate(result.channel_created_date)}
                                </div>
                            </div>
                        </a>
                    </td>
                    <td>
                        <div class="video-title" title="${result.title}">
                            ${result.title}
                        </div>
                    </td>
                    <td>
                        <div class="category-name">${result.primary_category}</div>
                        <div class="channel-rpm-info">
                            <span class="rpm-estimate" title="채널 전체 재생누적 RPM: $${result.channel_playback_rpm || '0.00'} | 채널 전체 광고누적 RPM: $${result.channel_ad_rpm || '0.00'}">$${result.channel_playback_rpm || '0.00'} | $${result.channel_ad_rpm || '0.00'}</span>
                        </div>
                    </td>
                    <td>
                        <div class="country-name">${countryName}</div>
                        <div class="country-rpm-info">
                                                            <span class="rpm-estimate">$${result.channel_total_rpm || '0.00'}</span>
                        </div>
                    </td>
                    ${uploadDateCell}
                    ${koreaTimeCell}
                    <td>
                        ${(() => {
                            // 서버에서 계산된 좋아요 데이터 사용
                            const likeCount = result.like_count || 0;
                            const isEstimated = result.is_like_estimated || false;
                            const colorClass = isEstimated ? 'like-count-estimated' : 'like-count-actual';
                            const percentage = result.like_percentage || 0;
                            return `
                                <div class="like-count-container">
                                    <div class="like-count ${colorClass} like-count-bold">${likeCount.toLocaleString()}</div>
                                    <div class="like-percentage">
                                        <span class="percentage-value">${percentage}%</span>
                                    </div>
                                </div>
                            `;
                        })()}
                    </td>
                    <td>
                        <div class="view-count">${viewCount}</div>
                        <div class="valid-view-count">
                            <span class="valid-view-value">${(result.valid_view_count || 0).toLocaleString()}</span>
                        </div>
                    </td>
                    <td>
                        <span class="subscriber-count">${subscriberCount}</span>
                        <div class="subscriber-view-rate">${result.valid_view_percentage || 0}%</div>
                    </td>
                    <td>
                        <div class="rpm-container">
                            <div class="rpm-estimate" title="재생기반 RPM: $${result.estimated_rpm || '0.00'} | 광고 RPM: $${result.ad_rpm || '0.00'}">$${result.estimated_rpm || '0.00'} | $${result.ad_rpm || '0.00'}</div>
                            <div class="rpm-total">
                                <span class="rpm-total-value">$${result.total_rpm || '0.00'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <a href="javascript:void(0)" onclick="openVideoWithCopy('${result.vod_url}')" class="video-link" title="동영상 열기 + URL 복사">
                            ▶️
                        </a>
                    </td>
                    <td>
                        <span class="duration-time" title="${result.duration_seconds}초">${formattedDuration}</span>
                        ${(() => {
                            // 서버에서 계산된 평균시청률 사용 (카테고리별 정교한 계산)
                            const percentage = result.avg_watch_rate_percentage || 0;
                            return `<div class="duration-percentage">${percentage}%</div>`;
                        })()}
                    </td>
                    <td>
                        <button class="download-btn" onclick="downloadThumbnail('${result.thumbnail_url}', '${result.youtube_channel_name}')" title="클릭하면 저장 위치를 선택할 수 있습니다">
                            ⬇️ 
                        </button>
                    </td>
                `;
                
                tbody.appendChild(row);
            });

            // 결과 수 업데이트
            document.getElementById('resultsCount').textContent = searchResults.length;

            // 페이지네이션 렌더링
            renderPagination();

            // 정렬 헤더 업데이트
            updateSortHeaders();
        }

        // 페이지네이션 렌더링 함수
        function renderPagination() {
            const totalPages = Math.ceil(searchResults.length / itemsPerPage);
            const pagination = document.getElementById('pagination');
            pagination.innerHTML = '';

            if (totalPages <= 1) return;

            // 이전 페이지 버튼
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '이전';
            prevBtn.disabled = currentPage === 1;
            prevBtn.onclick = () => changePage(currentPage - 1);
            pagination.appendChild(prevBtn);

            // 페이지 번호 버튼들
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);

            if (startPage > 1) {
                const btn = document.createElement('button');
                btn.textContent = '1';
                btn.onclick = () => changePage(1);
                pagination.appendChild(btn);

                if (startPage > 2) {
                    const dots = document.createElement('span');
                    dots.textContent = '...';
                    pagination.appendChild(dots);
                }
            }

            for (let i = startPage; i <= endPage; i++) {
                const btn = document.createElement('button');
                btn.textContent = i;
                btn.className = i === currentPage ? 'active' : '';
                btn.onclick = () => changePage(i);
                pagination.appendChild(btn);
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    const dots = document.createElement('span');
                    dots.textContent = '...';
                    pagination.appendChild(dots);
                }

                const btn = document.createElement('button');
                btn.textContent = totalPages;
                btn.onclick = () => changePage(totalPages);
                pagination.appendChild(btn);
            }

            // 다음 페이지 버튼
            const nextBtn = document.createElement('button');
            nextBtn.textContent = '다음';
            nextBtn.disabled = currentPage === totalPages;
            nextBtn.onclick = () => changePage(currentPage + 1);
            pagination.appendChild(nextBtn);

            // 페이지 정보
            const pageInfo = document.createElement('div');
            pageInfo.className = 'page-info';
            pageInfo.textContent = `${currentPage} / ${totalPages} 페이지`;
            pagination.appendChild(pageInfo);
        }

        // 페이지 변경 함수
        function changePage(newPage) {
            const totalPages = Math.ceil(searchResults.length / itemsPerPage);
            if (newPage >= 1 && newPage <= totalPages) {
                currentPage = newPage;
                renderResults();
            }
        }

        // 정렬 헤더 업데이트 함수
        function updateSortHeaders() {
            document.querySelectorAll('.results-table th').forEach(th => {
                th.classList.remove('sort-asc', 'sort-desc');
                if (th.dataset.sort === sortColumn) {
                    th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
                }
            });
        }





        // UI 상태 관리 함수들
        function showLoading() {
            document.getElementById('loadingIndicator').style.display = 'block';
        }

        function hideLoading() {
            document.getElementById('loadingIndicator').style.display = 'none';
        }

        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.innerHTML = message; // innerHTML로 변경하여 HTML 태그 지원
            errorDiv.style.display = 'block';
        }

        function hideError() {
            document.getElementById('errorMessage').style.display = 'none';
        }

        function showInfo(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.innerHTML = `<div style="background: #e3f2fd; color: #0277bd; border: 1px solid #81d4fa; border-radius: 8px; padding: 15px; margin: 10px 0;">${message}</div>`;
            errorDiv.style.display = 'block';
            
            // 3초 후 자동으로 숨김
            setTimeout(() => {
                hideError();
            }, 3000);
        }

        function showResults() {
            document.getElementById('resultsContainer').style.display = 'block';
            // Excel 다운로드 버튼 표시
            document.getElementById('downloadExcelBtn').style.display = 'flex';
        }

        function hideResults() {
            document.getElementById('resultsContainer').style.display = 'none';
            // Excel 다운로드 버튼 숨김
            document.getElementById('downloadExcelBtn').style.display = 'none';
        }

        // Excel 다운로드 함수
        async function downloadExcel() {
            if (!searchResults || searchResults.length === 0) {
                alert('다운로드할 검색 결과가 없습니다.');
                return;
            }

            try {
                const downloadBtn = document.getElementById('downloadExcelBtn');
                const originalText = downloadBtn.textContent;
                
                // 버튼 상태 변경
                downloadBtn.disabled = true;
                downloadBtn.textContent = '📊 ~';

                // 현재 검색 조건 수집
                const rawStartDate = document.getElementById('startDate').value;
                const rawEndDate = document.getElementById('endDate').value;
                
                // 날짜 유효성 검증
                let validStartDate = null;
                let validEndDate = null;
                
                if (rawStartDate) {
                    try {
                        const testDate = new Date(rawStartDate);
                        if (!isNaN(testDate.getTime()) && rawStartDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            validStartDate = rawStartDate;
                        }
                    } catch (error) {
                        console.error('Excel: 시작일 검증 오류:', error.message);
                    }
                }
                
                if (rawEndDate) {
                    try {
                        const testDate = new Date(rawEndDate);
                        if (!isNaN(testDate.getTime()) && rawEndDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            validEndDate = rawEndDate;
                        }
                    } catch (error) {
                        console.error('Excel: 종료일 검증 오류:', error.message);
                    }
                }
                
                const searchParams = {
                    keyword: document.getElementById('keyword').value || '전체',
                    country: document.getElementById('country').value || 'worldwide',
                    minViews: document.getElementById('minViews').value,
                    maxViews: document.getElementById('maxViews').value,
                    uploadPeriod: document.getElementById('uploadPeriod').value,
                    startDate: validStartDate,
                    endDate: validEndDate,
                    maxResults: document.getElementById('maxResults').value
                };

                // Excel 생성에 필요한 데이터만 추출하여 페이로드 크기 최적화
                const optimizedResults = searchResults.map(result => {
                    // 국가 정보 감지 (실시간 처리)
                    const countryInfo = detectVideoCountry(result);
                    // 브랜드 채널 감지
                    const isBrand = isBrandChannel(result);
                    
                    return {
                    youtube_channel_name: result.youtube_channel_name,
                    thumbnail_url: result.thumbnail_url,
                    status: result.status,
                    youtube_channel_id: result.youtube_channel_id,
                    title: result.title,
                    description: result.description || '',
                    daily_view_count: result.daily_view_count,
                    likes: (() => {
                        const likeData = getLikeCount(result);
                        return likeData.isEstimated ? `[${likeData.count}]` : likeData.count;
                    })(),
                    subscriber_count: result.subscriber_count,
                    vod_url: result.vod_url,
                    status_date: result.status_date,
                    duration_seconds: result.duration_seconds,
                    video_length_category: result.video_length_category,
                        primary_category: result.primary_category,
                        tags: result.tags || '',
                        country: countryInfo, // 국가 정보 추가
                        brand: isBrand ? 1 : 0 // 브랜드 채널 여부 (1: 브랜드, 0: 일반)
                    };
                });

                console.log('Excel 다운로드 요청:', {
                    resultsCount: optimizedResults.length,
                    originalSize: JSON.stringify(searchResults).length,
                    optimizedSize: JSON.stringify(optimizedResults).length,
                    searchParams: searchParams
                });

                // 서버에 Excel 생성 요청
                const response = await fetch('/api/download-excel', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        searchResults: optimizedResults,
                        searchParams: searchParams
                    })
                });

                if (!response.ok) {
                    throw new Error(`서버 오류: ${response.status}`);
                }

                // 파일명을 응답 헤더에서 추출하거나 기본값 사용
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'YouTube_검색결과.xlsx';
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (filenameMatch) {
                        filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
                    }
                }

                // 파일 다운로드 (폴더 선택 가능)
                const blob = await response.blob();
                await downloadExcelWithFolderChoice(blob, filename);

                console.log(`✅ Excel 파일 다운로드 완료: ${filename}`);
                
                // alert 창을 표시하고, 확인 버튼을 누른 후에 버튼 상태 복원
                alert(`✅ Excel 파일이 다운로드되었습니다!\n파일명: ${filename}\n데이터: ${searchResults.length}행`);
                
                // alert 창이 닫힌 후에 버튼 상태 복원
                downloadBtn.disabled = false;
                downloadBtn.textContent = originalText;

            } catch (error) {
                console.error('Excel 다운로드 오류:', error);
                alert('Excel 파일 다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
                
                // 오류 발생 시에도 alert 창이 닫힌 후에 버튼 상태 복원
                downloadBtn.disabled = false;
                downloadBtn.textContent = originalText;
            }
        }

        // Excel 파일 다운로드 (폴더 선택 가능)
        async function downloadExcelWithFolderChoice(blob, filename) {
            try {
                // 최신 브라우저에서 File System Access API 지원 확인
                if ('showSaveFilePicker' in window) {
                    // File System Access API 사용 (Chrome 86+, Edge 86+)
                    await downloadExcelWithFilePicker(blob, filename);
                } else if ('showDirectoryPicker' in window) {
                    // Directory Picker API 사용 (대체 방법)
                    await downloadExcelWithDirectoryPicker(blob, filename);
                } else {
                    // 기존 방식 (자동 다운로드) - 브라우저 호환성을 위한 fallback
                    await downloadExcelWithTraditionalMethod(blob, filename);
                }
            } catch (error) {
                // 사용자가 취소한 경우 fallback 하지 않음
                if (error.message && error.message.includes('취소')) {
                    throw error; // 취소 오류를 상위로 전달
                }
                console.error('Excel 다운로드 오류:', error);
                // 다른 오류 발생 시에만 기본 방식으로 fallback
                await downloadExcelWithTraditionalMethod(blob, filename);
            }
        }

        // File System Access API를 사용한 Excel 파일 저장 (위치 선택 가능)
        async function downloadExcelWithFilePicker(blob, filename) {
            try {
                // 파일 저장 위치 선택 다이얼로그 표시
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'Excel 파일',
                        accept: {
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                            'application/vnd.ms-excel': ['.xls']
                        }
                    }]
                });

                // 선택한 위치에 파일 저장
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`✅ Excel 파일이 선택한 위치에 저장되었습니다: ${filename}`);
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('사용자가 저장을 취소했습니다.');
                    throw new Error('저장이 취소되었습니다.');
                } else {
                    throw error;
                }
            }
        }

        // Directory Picker API를 사용한 Excel 파일 저장
        async function downloadExcelWithDirectoryPicker(blob, filename) {
            try {
                // 폴더 선택 다이얼로그 표시
                const dirHandle = await window.showDirectoryPicker();
                
                // 선택한 폴더에 파일 생성 및 저장
                const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`✅ Excel 파일이 선택한 폴더에 저장되었습니다: ${filename}`);
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('사용자가 폴더 선택을 취소했습니다.');
                    throw new Error('폴더 선택이 취소되었습니다.');
                } else {
                    throw error;
                }
            }
        }

        // 기존 방식 Excel 다운로드 (브라우저 호환성 fallback)
        async function downloadExcelWithTraditionalMethod(blob, filename) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            console.log(`📁 Excel 파일이 기본 다운로드 폴더에 저장됩니다: ${filename}`);
        }

        // 조회수를 원래 숫자 그대로 표시하는 함수
        function formatViewCount(count) {
            if (!count || count === 0) {
                return '0';
            }
            
            const number = parseInt(count);
            return number.toLocaleString();
        }

        // 구독자 수를 만 단위로 변환하는 함수
        function formatSubscriberCount(count) {
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

        // 동영상 재생시간을 HH:MM:SS 형식으로 변환하는 함수
        function formatDuration(durationSeconds) {
            if (!durationSeconds || durationSeconds === 0) {
                // 0초인 경우 라이브 또는 연속 스트림으로 판단
                return 'LIVE';
            }
            
            const hours = Math.floor(durationSeconds / 3600);
            const minutes = Math.floor((durationSeconds % 3600) / 60);
            const seconds = durationSeconds % 60;
            
            if (hours > 0) {
                // 1시간 이상인 경우: HH:MM:SS 형식
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                // 1시간 미만인 경우: MM:SS 형식
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }

        // 동영상 링크 클릭 시 URL 복사 및 새 탭 열기
        function openVideoWithCopy(videoUrl) {
            try {
                // URL을 클립보드에 복사
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(videoUrl).then(() => {
                        console.log('동영상 URL이 클립보드에 복사되었습니다:', videoUrl);
                    }).catch(err => {
                        console.log('URL 복사 실패:', err);
                    });
                } else {
                    // 구형 브라우저 지원
                    const textArea = document.createElement('textarea');
                    textArea.value = videoUrl;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        console.log('동영상 URL이 클립보드에 복사되었습니다 (fallback):', videoUrl);
                    } catch (fallbackErr) {
                        console.log('URL 복사 fallback 실패:', fallbackErr);
                    }
                    document.body.removeChild(textArea);
                }
                
                // 새 탭에서 동영상 열기
                window.open(videoUrl, '_blank');
                
                console.log('동영상 링크 열기:', videoUrl);
            } catch (error) {
                console.error('동영상 링크 처리 오류:', error);
                // 오류가 발생해도 최소한 링크는 열기
                window.open(videoUrl, '_blank');
            }
        }

        // 동영상 다운로드 함수 (화질 선택 모달 열기)
        let currentVideoUrl = '';
        let currentVideoTitle = '';
        let selectedQuality = '';
        
        function downloadVideo(videoUrl, videoTitle) {
            try {
                currentVideoUrl = videoUrl;
                currentVideoTitle = videoTitle;
                
                // 화질 선택 모달 열기
                document.getElementById('qualityModal').style.display = 'block';
                
            } catch (error) {
                console.error('동영상 다운로드 오류:', error);
                alert('동영상 다운로드 처리 중 오류가 발생했습니다.');
            }
        }
        
        // 화질 선택 함수
        function selectQuality(quality) {
            selectedQuality = quality;
            
            // 화질에 따른 다운로드 안내 메시지 생성
            let qualityText = '';
            let downloadTips = '';
            
            switch(quality) {
                case '4K':
                    qualityText = '4K (2160p) 최고 화질';
                    downloadTips = '최고 화질로 크기가 매우 클 수 있습니다. Wi-Fi 환경에서 다운로드를 추천합니다.';
                    break;
                case '1080p':
                    qualityText = 'Full HD (1080p) 고화질';
                    downloadTips = '가장 인기 있는 화질로 화질과 파일 크기의 바란스가 좋습니다.';
                    break;
                case '720p':
                    qualityText = 'HD (720p) 중간 화질';
                    downloadTips = '빠른 다운로드가 가능하며 대부분의 기기에서 원활하게 재생됩니다.';
                    break;
                case '480p':
                    qualityText = 'SD (480p) 기본 화질';
                    downloadTips = '작은 파일 크기로 데이터 절약이 가능합니다.';
                    break;
                case '360p':
                    qualityText = 'Low (360p) 낮은 화질';
                    downloadTips = '배경 재생이나 음성 위주의 콘텐츠에 적합합니다.';
                    break;
                case 'audio':
                    qualityText = '오디오만 (MP3/M4A)';
                    downloadTips = '음악, 팟컬스트, 강의 등 음성만 필요한 경우에 적합합니다.';
                    break;
            }
            
            const message = `선택한 화질: ${qualityText}\n\n` +
                `동영상: ${currentVideoTitle}\n\n` +
                `팁: ${downloadTips}\n\n` +
                `추천 다운로더:\n` +
                `1. yt-dlp (GitHub) - 최고 성능\n` +
                `2. 4K Video Downloader - 간편한 UI\n` +
                `3. ClipGrab - 사용 쉬움\n\n` +
                `온라인 서비스:\n` +
                `- savefrom.net\n` +
                `- y2mate.com\n` +
                `- keepvid.com\n\n` +
                `주의: 저작권 법률을 준수하여 개인 용도로만 사용하세요.`;
            
            alert(message);
            
            // URL 자동 복사
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(currentVideoUrl).then(() => {
                    console.log('동영상 URL이 클립보드에 복사되었습니다.');
                }).catch(err => {
                    console.log('URL 복사 실패:', err);
                });
            }
            
            // 동영상 페이지를 새 탭에서 열기
            window.open(currentVideoUrl, '_blank');
            
            // 모달 닫기
            closeQualityModal();
        }
        
        // 모달 닫기 함수
        function closeQualityModal() {
            document.getElementById('qualityModal').style.display = 'none';
            currentVideoUrl = '';
            currentVideoTitle = '';
            selectedQuality = '';
        }
        
        // URL 복사 후 모달 닫기
        function copyVideoUrl() {
            if (currentVideoUrl) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(currentVideoUrl).then(() => {
                        alert('동영상 URL이 클립보드에 복사되었습니다!');
                        closeQualityModal();
                    }).catch(err => {
                        alert('URL 복사에 실패했습니다.');
                        console.log('URL 복사 실패:', err);
                    });
                } else {
                    // 클립보드 API를 지원하지 않는 경우
                    alert(`URL을 수동으로 복사하세요:\n\n${currentVideoUrl}`);
                    closeQualityModal();
                }
            }
        }
        



        // 동영상 링크 클릭 시 URL 복사 + 새 탭 열기 함수
        function openVideoWithCopy(videoUrl) {
            try {
                // 1. 클립보드에 URL 복사
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(videoUrl).then(() => {
                        console.log('✅ URL이 클립보드에 복사되었습니다:', videoUrl);
                        
                        // 복사 성공을 시각적으로 표시 (선택적)
                        showCopyNotification('URL이 클립보드에 복사되었습니다!');
                    }).catch(err => {
                        console.warn('URL 복사 실패:', err);
                        // 복사 실패 시에도 링크는 열기
                        showCopyNotification('링크를 열었습니다 (URL 복사는 실패)', 'warning');
                    });
                } else {
                    // 클립보드 API를 지원하지 않는 경우
                    console.warn('클립보드 API 미지원 - URL 복사 건너뛰기');
                    showCopyNotification('링크를 열었습니다 (브라우저가 자동복사 미지원)', 'info');
                }
                
                // 2. 새 탭에서 YouTube 페이지 열기
                window.open(videoUrl, '_blank');
                
            } catch (error) {
                console.error('링크 처리 오류:', error);
                // 오류 발생 시에도 최소한 링크는 열기
                window.open(videoUrl, '_blank');
            }
        }
        
        // URL 복사 알림 표시 함수
        function showCopyNotification(message, type = 'success') {
            // 기존 알림이 있으면 제거
            const existingNotification = document.getElementById('copyNotification');
            if (existingNotification) {
                existingNotification.remove();
            }
            
            // 새 알림 생성
            const notification = document.createElement('div');
            notification.id = 'copyNotification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                padding: 12px 20px;
                border-radius: 8px;
                font-weight: 500;
                font-size: 14px;
                max-width: 300px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                transform: translateX(100%);
                transition: transform 0.3s ease-in-out;
                cursor: pointer;
            `;
            
            // 타입별 스타일 설정
            if (type === 'success') {
                notification.style.backgroundColor = '#d4edda';
                notification.style.color = '#155724';
                notification.style.border = '1px solid #c3e6cb';
                notification.innerHTML = `✅ ${message}`;
            } else if (type === 'warning') {
                notification.style.backgroundColor = '#fff3cd';
                notification.style.color = '#856404';
                notification.style.border = '1px solid #ffeaa7';
                notification.innerHTML = `⚠️ ${message}`;
            } else if (type === 'info') {
                notification.style.backgroundColor = '#e3f2fd';
                notification.style.color = '#0277bd';
                notification.style.border = '1px solid #81d4fa';
                notification.innerHTML = `ℹ️ ${message}`;
            }
            
            // 페이지에 추가
            document.body.appendChild(notification);
            
            // 애니메이션으로 표시
            setTimeout(() => {
                notification.style.transform = 'translateX(0)';
            }, 100);
            
            // 클릭 시 즉시 제거
            notification.addEventListener('click', () => {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            });
            
            // 3초 후 자동 제거
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.transform = 'translateX(100%)';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                    }, 300);
                }
            }, 3000);
        }

        // 검색 범위 이벤트들은 initializeApp에서 등록됨

        // 중복된 함수 정의 제거됨 (이미 위에서 정의됨)

        // 중복된 검색 범위 이벤트 제거됨 (initializeApp에서 등록)

        // 중복된 함수 정의 제거됨 (이미 위에서 정의됨)

        // 카테고리 드롭다운 기능 (DOMContentLoaded에서 설정됨)
        
        // 중복된 document 클릭 이벤트 제거됨 (1913라인에 이미 정의됨)

        // 모든 카테고리 선택/해제 이벤트는 initializeApp에서 등록됨

        // 개별 카테고리 체크박스 이벤트는 initializeApp에서 등록됨

        // 중복된 함수 정의 제거됨 (2744라인에 이미 정의되어 있음)
        
        // 국가 드롭다운 클릭 핸들러 함수
        function countryDisplayClickHandler() {
            const dropdown = document.getElementById('countryDropdown');
            if (dropdown) {
                dropdown.classList.toggle('show');
                console.log('국가 드롭다운 클릭됨, show 클래스:', dropdown.classList.contains('show'));
            }
        }
        
        // 국가 키보드 이벤트 핸들러
        function countryDisplayKeyHandler(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                countryDisplayClickHandler();
            }
        }

        // 국가 디스플레이 업데이트 함수 (Single Choice)
        function updateCountryDisplay() {
            const selectedRadio = document.querySelector('input[name="country"]:checked');
            const display = document.getElementById('countryDisplay');
            
            if (selectedRadio) {
                const label = selectedRadio.parentElement.querySelector('label');
                display.textContent = label.textContent + ' 선택됨';
            } else {
                display.textContent = '국가를 선택해주세요';
            }
        }

        // Single choice에서는 모든 국가 선택 기능이 필요 없으므로 제거됨

        // 시간대 필터 초기화
        function initializeTimezoneFilters() {
            // 시간대 "모두 선택" 체크박스 이벤트
            document.getElementById('selectAllTimezone').addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                const timezoneCheckboxes = [
                    'timezoneKrGolden', 'timezoneGlobalSweet', 'timezoneShortsPeak', 'timezoneKrLunch',
                    'timezoneUsEast', 'timezoneKrNight', 'timezoneKrMorning', 'timezoneWeekend', 'timezoneJpPrime'
                ];
                
                timezoneCheckboxes.forEach(id => {
                    const checkbox = document.getElementById(id);
                    if (checkbox) {
                        checkbox.checked = isChecked;
                    }
                });
                
                updateTimezoneGroupCheckboxes();
            });

            // 시간대 "골든타임" 그룹 체크박스 이벤트
            document.getElementById('selectGoldenTime').addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                const goldenTimeCheckboxes = ['timezoneKrGolden', 'timezoneGlobalSweet', 'timezoneShortsPeak'];
                
                goldenTimeCheckboxes.forEach(id => {
                    const checkbox = document.getElementById(id);
                    if (checkbox) {
                        checkbox.checked = isChecked;
                    }
                });
                
                updateSelectAllTimezone();
                updateTimezoneGroupCheckboxes();
            });

            // 시간대 "피크타임" 그룹 체크박스 이벤트
            document.getElementById('selectPeakTime').addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                const peakTimeCheckboxes = ['timezoneKrLunch', 'timezoneUsEast', 'timezoneWeekend', 'timezoneJpPrime'];
                
                peakTimeCheckboxes.forEach(id => {
                    const checkbox = document.getElementById(id);
                    if (checkbox) {
                        checkbox.checked = isChecked;
                    }
                });
                
                updateSelectAllTimezone();
                updateTimezoneGroupCheckboxes();
            });

            // 개별 시간대 체크박스 변경 시 상태 업데이트
            const timezoneCheckboxes = [
                'timezoneKrGolden', 'timezoneGlobalSweet', 'timezoneShortsPeak', 'timezoneKrLunch',
                'timezoneUsEast', 'timezoneKrNight', 'timezoneKrMorning', 'timezoneWeekend', 'timezoneJpPrime'
            ];
            
            timezoneCheckboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.addEventListener('change', () => {
                        updateSelectAllTimezone();
                        updateTimezoneGroupCheckboxes();
                    });
                }
            });
        }

        // 시간대 "모두 선택" 상태 업데이트
        function updateSelectAllTimezone() {
            const timezoneCheckboxes = [
                'timezoneKrGolden', 'timezoneGlobalSweet', 'timezoneShortsPeak', 'timezoneKrLunch',
                'timezoneUsEast', 'timezoneKrNight', 'timezoneKrMorning', 'timezoneWeekend', 'timezoneJpPrime'
            ];
            
            const checkedCount = timezoneCheckboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectAllCheckbox = document.getElementById('selectAllTimezone');
            if (checkedCount === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (checkedCount === timezoneCheckboxes.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }

        // 시간대 그룹 체크박스 상태 업데이트
        function updateTimezoneGroupCheckboxes() {
            const goldenTimeCheckboxes = ['timezoneKrGolden', 'timezoneGlobalSweet', 'timezoneShortsPeak'];
            const peakTimeCheckboxes = ['timezoneKrLunch', 'timezoneUsEast', 'timezoneWeekend', 'timezoneJpPrime'];
            
            // 골든타임 체크박스 상태 확인
            const goldenCheckedCount = goldenTimeCheckboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectGoldenCheckbox = document.getElementById('selectGoldenTime');
            if (goldenCheckedCount === 0) {
                selectGoldenCheckbox.checked = false;
                selectGoldenCheckbox.indeterminate = false;
            } else if (goldenCheckedCount === goldenTimeCheckboxes.length) {
                selectGoldenCheckbox.checked = true;
                selectGoldenCheckbox.indeterminate = false;
            } else {
                selectGoldenCheckbox.checked = false;
                selectGoldenCheckbox.indeterminate = true;
            }
            
            // 피크타임 체크박스 상태 확인
            const peakCheckedCount = peakTimeCheckboxes.filter(id => {
                const checkbox = document.getElementById(id);
                return checkbox && checkbox.checked;
            }).length;
            
            const selectPeakCheckbox = document.getElementById('selectPeakTime');
            if (peakCheckedCount === 0) {
                selectPeakCheckbox.checked = false;
                selectPeakCheckbox.indeterminate = false;
            } else if (peakCheckedCount === peakTimeCheckboxes.length) {
                selectPeakCheckbox.checked = true;
                selectPeakCheckbox.indeterminate = false;
            } else {
                selectPeakCheckbox.checked = false;
                selectPeakCheckbox.indeterminate = true;
            }
        }
        
        // 중복된 DOMContentLoaded 이벤트 제거됨 (통합된 initializeApp 함수로 대체)
        
        // 중복된 DOMContentLoaded 제거됨 (initializeApp에서 모든 초기화 처리)

        // 전역 변수들
        let allSearchResults = []; // 원본 검색 결과 저장
        let filteredResults = []; // 필터링된 결과
        let currentTimezoneFilter = {}; // 현재 적용된 시간대 필터
        
        // 결과내 재검색 필터링 로직
        function initializeTimezoneFilter() {
            // 필터 토글 버튼
            document.getElementById('toggleResultsFilter').addEventListener('click', () => {
                const content = document.getElementById('resultsFilterContent');
                content.classList.toggle('collapsed');
            });
            
            // 필터 적용 버튼
            document.getElementById('applyTimezoneFilter').addEventListener('click', applyTimezoneFilter);
            
            // 필터 리셋 버튼
            document.getElementById('resetTimezoneFilter').addEventListener('click', resetTimezoneFilter);
            
            // 떡상 시간대만 선택 버튼
            document.getElementById('selectBestTimes').addEventListener('click', selectBestTimes);
            
            // 체크박스 이벤트 리스너
            const filterCheckboxes = [
                'filterPrimeTime', 'filterMorningCommute', 'filterLunchTime',
                'filterEveningCommute', 'filterLateNight', 'filterWorkTime',
                'filterWeekend', 'filterWeekday', 'filterMorningTime',
                'filterAfternoonTime', 'filterEveningTime', 'filterEarlyMorningTime'
            ];
            
            filterCheckboxes.forEach(id => {
                document.getElementById(id).addEventListener('change', updateFilterPreview);
            });
        }
        
        // 검색 결과에 시간대 분석 추가
        function analyzeSearchResults(results) {
            console.log('🔍 시간대 분석 시작:', results.length, '개 동영상');
            
            const analyzedResults = results.map(video => {
                // 각 동영상의 국가에 맞는 시간대 사용
                const detectedCountry = detectVideoCountry(video);
                const countryCode = getCountryCodeFromName(detectedCountry);
                const timeAnalysis = analyzeUploadTime(video.status_date, countryCode);
                return {
                    ...video,
                    timeAnalysis: timeAnalysis
                };
            });
            
            // ✅ allSearchResults는 변경하지 않고, 분석된 결과를 allSearchResults에 시간대 분석 추가
            allSearchResults = allSearchResults.map(video => {
                const analyzedVideo = analyzedResults.find(av => av.video_id === video.video_id);
                return analyzedVideo || video;
            });
            filteredResults = [...allSearchResults]; // 전체 결과로 초기화
            
            updateTimezoneStats(analyzedResults);
            showTimezoneFilter();
            
            return analyzedResults;
        }
        
        // 시간대별 통계 업데이트
        function updateTimezoneStats(results) {
            const stats = {
                'prime-time': 0,
                'morning-commute': 0,
                'lunch-time': 0,
                'evening-commute': 0,
                'late-night': 0,
                'work-time': 0, // morning-work + afternoon-work 합계
                'weekend': 0,
                'weekday': 0,
                'morning-work': 0, // 09-12시
                'afternoon-work': 0, // 14-18시
                'early-morning': 0 // 02-06시
            };
            
            results.forEach(video => {
                const analysis = video.timeAnalysis;
                const category = analysis.timeCategory;
                
                // 기본 시간대별 카운트
                if (stats.hasOwnProperty(category)) {
                    stats[category]++;
                }
                
                // 업무시간 (09-18시) 계산
                if (category === 'morning-work' || category === 'lunch-time' || category === 'afternoon-work') {
                    stats['work-time']++;
                }
                
                // 주말/평일 카운트
                if (analysis.isWeekend) {
                    stats['weekend']++;
                } else {
                    stats['weekday']++;
                }
            });
            
            // UI 업데이트
            document.getElementById('primeTimeCount').textContent = `${stats['prime-time']}개`;
            document.getElementById('morningCommuteCount').textContent = `${stats['morning-commute']}개`;
            document.getElementById('lunchTimeCount').textContent = `${stats['lunch-time']}개`;
            document.getElementById('eveningCommuteCount').textContent = `${stats['evening-commute']}개`;
            document.getElementById('lateNightCount').textContent = `${stats['late-night']}개`;
            document.getElementById('workTimeCount').textContent = `${stats['work-time']}개`;
            document.getElementById('weekendCount').textContent = `${stats['weekend']}개`;
            document.getElementById('weekdayCount').textContent = `${stats['weekday']}개`;
            document.getElementById('morningTimeCount').textContent = `${stats['morning-work']}개`;
            document.getElementById('afternoonTimeCount').textContent = `${stats['afternoon-work']}개`;
            document.getElementById('eveningTimeCount').textContent = `${stats['prime-time']}개`;
            document.getElementById('earlyMorningTimeCount').textContent = `${stats['early-morning']}개`;
            
            // 통계 요약 표시
            const totalVideos = results.length;
            const bestTimeSlots = [
                { name: '골든타임 (20-23시)', count: stats['prime-time'], rate: (stats['prime-time']/totalVideos*100).toFixed(1) },
                { name: '퇴근시간 (18-20시)', count: stats['evening-commute'], rate: (stats['evening-commute']/totalVideos*100).toFixed(1) },
                { name: '점심시간 (12-14시)', count: stats['lunch-time'], rate: (stats['lunch-time']/totalVideos*100).toFixed(1) }
            ].sort((a, b) => b.count - a.count);
            
            const statsText = `총 ${totalVideos}개 영상 분석 완료 | 
                상위 시간대: ${bestTimeSlots[0].name} ${bestTimeSlots[0].count}개 (${bestTimeSlots[0].rate}%), 
                ${bestTimeSlots[1].name} ${bestTimeSlots[1].count}개 (${bestTimeSlots[1].rate}%), 
                ${bestTimeSlots[2].name} ${bestTimeSlots[2].count}개 (${bestTimeSlots[2].rate}%)`;
            
            document.getElementById('filterStats').textContent = statsText;
        }
        
        // 시간대 필터 표시
        function showTimezoneFilter() {
            document.getElementById('resultsFilterContainer').style.display = 'block';
        }
        
        // 필터 미리보기 업데이트
        function updateFilterPreview() {
            const selectedFilters = getSelectedFilters();
            const previewCount = countFilteredResults(selectedFilters);
            
            // 여기서 실시간으로 필터링 결과 개수를 보여줄 수 있음
            console.log('필터 미리보기:', previewCount, '개 결과 예상');
        }
        
        // 선택된 필터 가져오기
        function getSelectedFilters() {
            return {
                primeTime: document.getElementById('filterPrimeTime').checked,
                morningCommute: document.getElementById('filterMorningCommute').checked,
                lunchTime: document.getElementById('filterLunchTime').checked,
                eveningCommute: document.getElementById('filterEveningCommute').checked,
                lateNight: document.getElementById('filterLateNight').checked,
                workTime: document.getElementById('filterWorkTime').checked,
                weekend: document.getElementById('filterWeekend').checked,
                weekday: document.getElementById('filterWeekday').checked,
                morningTime: document.getElementById('filterMorningTime').checked,
                afternoonTime: document.getElementById('filterAfternoonTime').checked,
                eveningTime: document.getElementById('filterEveningTime').checked,
                earlyMorningTime: document.getElementById('filterEarlyMorningTime').checked
            };
        }
        
        // 필터링된 결과 개수 계산
        function countFilteredResults(filters) {
            return allSearchResults.filter(video => matchesTimeFilter(video, filters)).length;
        }
        
        // 시간대 필터 매칭 검사 (중복 매칭 방지 + 조건 조합 명확화)
        function matchesTimeFilter(video, filters) {
            const analysis = video.timeAnalysis;
            const category = analysis.timeCategory;
            
            // ✅ 모든 조건을 배열로 수집하여 중복 매칭 방지
            const timeMatches = [];
            const dayMatches = [];
            
            // 시간대별 필터 확인
            if (filters.primeTime && category === 'prime-time') timeMatches.push('primeTime');
            if (filters.morningCommute && category === 'morning-commute') timeMatches.push('morningCommute');
            if (filters.lunchTime && category === 'lunch-time') timeMatches.push('lunchTime');
            if (filters.eveningCommute && category === 'evening-commute') timeMatches.push('eveningCommute');
            if (filters.lateNight && category === 'late-night') timeMatches.push('lateNight');
            if (filters.workTime && (category === 'morning-work' || category === 'lunch-time' || category === 'afternoon-work')) timeMatches.push('workTime');
            
            // 새로운 시간대 필터 확인
            if (filters.morningTime && category === 'morning-work') timeMatches.push('morningTime');
            if (filters.afternoonTime && category === 'afternoon-work') timeMatches.push('afternoonTime');
            if (filters.eveningTime && category === 'prime-time') timeMatches.push('eveningTime');
            if (filters.earlyMorningTime && category === 'early-morning') timeMatches.push('earlyMorningTime');
            
            // 주말/평일 필터 확인
            if (filters.weekend && analysis.isWeekend) dayMatches.push('weekend');
            if (filters.weekday && !analysis.isWeekend) dayMatches.push('weekday');
            
            // ✅ 옵션 2: 조건 조합 명확화
            // 요일과 시간대 모두 선택된 경우 - 교집합 (AND)
            if (dayMatches.length > 0 && timeMatches.length > 0) {
                return true; // 두 조건 모두 만족
            }
            
            // 요일만 선택된 경우 - 해당 요일 전체
            if (dayMatches.length > 0 && timeMatches.length === 0) {
                return true;
            }
            
            // 시간대만 선택된 경우 - 해당 시간대 전체 (주말+평일)
            if (timeMatches.length > 0 && dayMatches.length === 0) {
                return true;
            }
            
            return false; // 아무것도 선택되지 않음
        }
        
        // 필터 적용
        function applyTimezoneFilter() {
            console.log('🔧 applyTimezoneFilter 시작');
            const filters = getSelectedFilters();
            console.log('🔧 선택된 필터:', filters);
            
            // 최소 하나의 필터는 선택되어야 함
            const hasAnyFilter = Object.values(filters).some(value => value);
            if (!hasAnyFilter) {
                alert('최소 하나의 시간대를 선택해주세요.');
                return;
            }
            
            console.log('📊 필터링 전 allSearchResults.length:', allSearchResults.length);
            console.log('📊 필터링 전 첫 번째 요소:', allSearchResults[0]);
            
            // ✅ 새롭게 선택된 조건만으로 필터링 (이전 조건 영향 제거)
            filteredResults = allSearchResults.filter(video => matchesTimeFilter(video, filters));
            currentTimezoneFilter = filters;
            
            console.log('🔍 필터 적용 완료:', filteredResults.length, '개 결과');
            console.log('📊 전체 결과:', allSearchResults.length, '개');
            console.log('📊 필터링된 첫 번째 요소:', filteredResults[0]);
            
            // 결과 표시 업데이트
            updateFilteredResultsDisplay();
        }
        
        // 필터 리셋 (토글 방식)
        function resetTimezoneFilter() {
            const checkboxes = [
                'filterPrimeTime', 'filterMorningCommute', 'filterLunchTime',
                'filterEveningCommute', 'filterLateNight', 'filterWorkTime',
                'filterWeekend', 'filterWeekday', 'filterMorningTime',
                'filterAfternoonTime', 'filterEveningTime', 'filterEarlyMorningTime'
            ];
            
            // 현재 선택된 체크박스 개수 확인
            const checkedCount = checkboxes.filter(id => 
                document.getElementById(id).checked
            ).length;
            
            // 모두 선택되어 있으면 모두 해제, 아니면 모두 선택
            const shouldSelectAll = checkedCount < checkboxes.length;
            
            checkboxes.forEach(id => {
                document.getElementById(id).checked = shouldSelectAll;
            });
            
            // ✅ 체크박스만 변경하고, 필터 적용은 하지 않음
            // 사용자가 "필터 적용" 버튼을 눌러야 실제 적용됨
            
                // 버튼 텍스트 변경
            if (shouldSelectAll) {
                document.getElementById('resetTimezoneFilter').textContent = '모두 해제';
            } else {
                document.getElementById('resetTimezoneFilter').textContent = '모두 선택';
            }
            
            // 필터 미리보기 업데이트
            updateFilterPreview();
        }
        
        // 떡상 시간대만 선택
        function selectBestTimes() {
            // 모든 체크박스 해제
            const checkboxes = [
                'filterPrimeTime', 'filterMorningCommute', 'filterLunchTime',
                'filterEveningCommute', 'filterLateNight', 'filterWorkTime',
                'filterWeekend', 'filterWeekday', 'filterMorningTime',
                'filterAfternoonTime', 'filterEveningTime', 'filterEarlyMorningTime'
            ];
            
            checkboxes.forEach(id => {
                document.getElementById(id).checked = false;
            });
            
            // 떡상 확률이 높은 시간대만 선택 (골든타임, 퇴근시간, 점심시간)
            document.getElementById('filterPrimeTime').checked = true;
            document.getElementById('filterEveningCommute').checked = true;
            document.getElementById('filterLunchTime').checked = true;
            document.getElementById('filterWeekend').checked = true; // 주말도 떡상 시간대
            
            // 체크박스만 선택하고 필터 적용은 하지 않음 - 사용자가 "필터 적용" 버튼을 눌러야 함
            updateFilterPreview();
        }
        
        // 필터링된 결과 표시 업데이트
        function updateFilteredResultsDisplay() {
            console.log('📱 updateFilteredResultsDisplay 호출됨');
            console.log('📊 filteredResults.length:', filteredResults.length);
            console.log('📊 allSearchResults.length:', allSearchResults.length);
            
            // 결과 개수 업데이트
            const totalResultsInfo = document.getElementById('totalResultsInfo');
            const totalCount = document.getElementById('totalCount');
            const searchKeywordInfo = document.getElementById('searchKeywordInfo');
            const searchKeyword = document.getElementById('searchKeyword');
            
            // 결과내 재검색 시에는 항상 필터링된 개수/전체 개수 형태로 표시
                document.getElementById('resultsCount').textContent = filteredResults.length;
                totalCount.textContent = allSearchResults.length;
                totalResultsInfo.style.display = 'inline';
            
            console.log('📊 화면에 표시: ' + filteredResults.length + '/' + allSearchResults.length);
                
                // 검색어 표시
                const currentKeyword = document.getElementById('keyword').value || '';
                if (currentKeyword.trim()) {
                    searchKeyword.textContent = currentKeyword;
                    searchKeywordInfo.style.display = 'inline';
                } else {
                    searchKeywordInfo.style.display = 'none';
                }
            
            // ✅ searchResults는 변경하지 않고, renderResults에서 filteredResults 사용
            currentPage = 1; // 첫 페이지로 리셋
            renderFilteredResults();
        }
        
        // 필터링된 결과 렌더링 함수
        function renderFilteredResults() {
            console.log('🎬 renderFilteredResults 호출됨');
            console.log('📊 filteredResults.length:', filteredResults.length);
            console.log('📊 allSearchResults.length:', allSearchResults.length);
            
            // ✅ 임시로 searchResults를 filteredResults로 바꿔서 기존 renderResults 함수 사용
            const originalSearchResults = [...searchResults];
            searchResults = [...filteredResults];
            
            console.log('🔄 임시로 searchResults를 filteredResults로 변경:', searchResults.length);
            
            // 기존 renderResults 함수 호출
            renderResults();
            
            // ✅ 원래 searchResults 복원
            searchResults = originalSearchResults;
            
            console.log('🔄 searchResults 복원 완료:', searchResults.length);
            
            // ✅ 페이지네이션을 filteredResults 기준으로 업데이트
            updatePagination(filteredResults.length);
        }

        
        // Excel 다운로드 함수
        async function downloadExcel() {
            try {
                const button = document.getElementById('downloadExcelBtn');
                const originalText = button.innerHTML;
                
                // 버튼 상태 변경
                button.disabled = true;
                document.getElementById('excelBtnPrefix').textContent = '[';
                document.getElementById('excelBtnSuffix').textContent = ']';
                
                // 현재 표시된 결과 데이터 가져오기
                if (!searchResults || searchResults.length === 0) {
                    alert('다운로드할 검색 결과가 없습니다.');
                    return;
                }
                
                // 검색 파라미터 수집
                const searchParams = {
                    country: getSelectedCountries().join(',') || 'worldwide',
                    keyword: document.getElementById('keyword').value || '',
                    minViews: document.getElementById('minViews').value || '',
                    maxViews: document.getElementById('maxViews').value || '',
                    uploadPeriod: document.getElementById('uploadPeriod').value || '',
                    startDate: document.getElementById('startDate').value || '',
                    endDate: document.getElementById('endDate').value || '',
                    categories: getSelectedCategories().join(',') || '',
                    maxResults: document.getElementById('maxResults').value || '20'
                };
                
                console.log('Excel 다운로드 시작:', {
                    resultsCount: searchResults.length,
                    searchParams: searchParams
                });
                
                // 서버로 Excel 다운로드 요청
                const response = await fetch('/api/download-excel', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        searchResults: searchResults,
                        searchParams: searchParams
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }
                
                // 파일 다운로드 처리
                const blob = await response.blob();
                
                // 파일명 추출 (Content-Disposition 헤더에서)
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'YouTube_검색결과.xlsx';
                
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/); 
                if (filenameMatch) {
                    filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
                }
                }
                
                // 폴더 선택 가능한 다운로드 처리
                await downloadExcelWithFolderChoice(blob, filename);
                
                console.log('Excel 파일 다운로드 성공:', filename);
                alert(`✅ Excel 파일이 다운로드되었습니다!\n\n파일명: ${filename}\n결과 수: ${searchResults.length}건`);
                
            } catch (error) {
                console.error('Excel 다운로드 오류:', error);
                
                // 사용자가 취소한 경우 알림 표시하지 않음
                if (error.message && error.message.includes('취소')) {
                    console.log('사용자가 Excel 다운로드를 취소했습니다.');
                    return;
                }
                
                let errorMessage = 'Excel 파일 다운로드에 실패했습니다.';
                
                if (error.message.includes('413')) {
                    errorMessage += '\n\n원인: 결과가 너무 많습니다 (1000건 초과)\n해결: 검색 결과를 1000건 이하로 줄여주세요.';
                } else if (error.message.includes('400')) {
                    errorMessage += '\n\n원인: 잘못된 요청 데이터\n해결: 검색을 다시 실행해주세요.';
                } else if (error.message.includes('500')) {
                    errorMessage += '\n\n원인: 서버 내부 오류\n해결: 잠시 후 다시 시도해주세요.';
                } else {
                    errorMessage += `\n\n오류 세부사항: ${error.message}`;
                }
                
                alert(errorMessage);
            } finally {
                // 버튼 상태 복원
                const button = document.getElementById('downloadExcelBtn');
                if (button) {
                    button.disabled = false;
                    document.getElementById('excelBtnPrefix').textContent = '';
                    document.getElementById('excelBtnSuffix').textContent = '';
                }
            }
        }

        // 중복 함수 제거됨 (위에서 이미 정의됨)



        // Excel 파일 다운로드 (폴더 선택 가능)
        async function downloadExcelWithFolderChoice(blob, filename) {
            try {
                // 최신 브라우저에서 File System Access API 지원 확인
                if ('showSaveFilePicker' in window) {
                    // File System Access API 사용 (Chrome 86+, Edge 86+)
                    await downloadExcelWithFilePicker(blob, filename);
                } else if ('showDirectoryPicker' in window) {
                    // Directory Picker API 사용 (대체 방법)
                    await downloadExcelWithDirectoryPicker(blob, filename);
                } else {
                    // 기존 방식 (자동 다운로드) - 브라우저 호환성을 위한 fallback
                    await downloadExcelWithTraditionalMethod(blob, filename);
                }
            } catch (error) {
                // 사용자가 취소한 경우 fallback 하지 않음
                if (error.message && error.message.includes('취소')) {
                    throw error; // 취소 오류를 상위로 전달
                }
                console.error('Excel 다운로드 오류:', error);
                // 다른 오류 발생 시에만 기본 방식으로 fallback
                await downloadExcelWithTraditionalMethod(blob, filename);
            }
        }

        // File System Access API를 사용한 Excel 파일 저장 (위치 선택 가능)
        async function downloadExcelWithFilePicker(blob, filename) {
            try {
                // 파일 저장 위치 선택 다이얼로그 표시
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'Excel 파일',
                        accept: {
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                            'application/vnd.ms-excel': ['.xls']
                        }
                    }]
                });

                // 선택한 위치에 파일 저장
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`✅ Excel 파일이 선택한 위치에 저장되었습니다: ${filename}`);
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('사용자가 저장을 취소했습니다.');
                    throw new Error('저장이 취소되었습니다.');
                } else {
                    throw error;
                }
            }
        }

        // Directory Picker API를 사용한 Excel 파일 저장
        async function downloadExcelWithDirectoryPicker(blob, filename) {
            try {
                // 폴더 선택 다이얼로그 표시
                const dirHandle = await window.showDirectoryPicker();
                
                // 선택한 폴더에 파일 생성 및 저장
                const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`✅ Excel 파일이 선택한 폴더에 저장되었습니다: ${filename}`);
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('사용자가 폴더 선택을 취소했습니다.');
                    throw new Error('폴더 선택이 취소되었습니다.');
                } else {
                    throw error;
                }
            }
        }

        // 기존 방식 Excel 다운로드 (브라우저 호환성 fallback)
        async function downloadExcelWithTraditionalMethod(blob, filename) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            console.log(`📁 Excel 파일이 기본 다운로드 폴더에 저장됩니다: ${filename}`);
        }

        // performSearch 함수에서 Excel 버튼 표시 처리
        function showExcelDownloadButton() {
            const excelBtn = document.getElementById('downloadExcelBtn');
            if (excelBtn && searchResults && searchResults.length > 0) {
                excelBtn.style.display = 'flex';
                console.log('Excel 다운로드 버튼 활성화:', searchResults.length, '개 결과');
            }
        }

        // 자동완성 기능
        let searchTimeout;
        let currentSuggestions = [];

        // 자동완성 초기화
        function initializeAutocomplete() {
            const keywordInput = document.getElementById('keyword');
            const suggestionsContainer = document.getElementById('suggestions');
            
            if (!keywordInput || !suggestionsContainer) return;

            // 입력 이벤트 리스너
            keywordInput.addEventListener('input', handleKeywordInput);
            keywordInput.addEventListener('blur', hideSuggestions);
            keywordInput.addEventListener('focus', showSuggestionsIfHasContent);
            
            // 키보드 이벤트 리스너
            keywordInput.addEventListener('keydown', handleKeyboardNavigation);
        }

        // 키워드 입력 처리
        async function handleKeywordInput(e) {
            const query = e.target.value.trim();
            
            clearTimeout(searchTimeout);
            
            if (query.length < 2) {
                hideSuggestions();
                return;
            }
            
            // 디바운싱: 300ms 후에 검색
            searchTimeout = setTimeout(async () => {
                try {
                    const response = await fetch(`/api/suggest?query=${encodeURIComponent(query)}`);
                    const data = await response.json();
                    
                    if (data.success) {
                        currentSuggestions = data.suggestions;
                        showSuggestions(data.suggestions);
                    } else {
                        hideSuggestions();
                    }
                } catch (error) {
                    console.error('자동완성 오류:', error);
                    hideSuggestions();
                }
            }, 300);
        }

        // 제안 표시
        function showSuggestions(suggestions) {
            const container = document.getElementById('suggestions');
            if (!container) return;
            
            if (suggestions.length === 0) {
                hideSuggestions();
                return;
            }
            
            container.innerHTML = suggestions.map((suggestion, index) => `
                <div class="suggestion-item" data-index="${index}" onclick="selectSuggestion('${suggestion.text}')">
                    <span class="suggestion-type ${suggestion.type}">${suggestion.type === 'title' ? '제목' : '채널'}</span>
                    <span class="suggestion-text">${suggestion.text}</span>
                </div>
            `).join('');
            
            container.style.display = 'block';
        }

        // 제안 숨기기
        function hideSuggestions() {
            const container = document.getElementById('suggestions');
            if (container) {
                container.style.display = 'none';
            }
        }

        // 포커스 시 내용이 있으면 제안 표시
        function showSuggestionsIfHasContent(e) {
            const query = e.target.value.trim();
            if (query.length >= 2 && currentSuggestions.length > 0) {
                showSuggestions(currentSuggestions);
            }
        }

        // 제안 선택
        function selectSuggestion(text) {
            const keywordInput = document.getElementById('keyword');
            if (keywordInput) {
                keywordInput.value = text;
                hideSuggestions();
                keywordInput.focus();
            }
        }

        // 키보드 네비게이션
        function handleKeyboardNavigation(e) {
            const container = document.getElementById('suggestions');
            if (!container || container.style.display === 'none') return;
            
            const items = container.querySelectorAll('.suggestion-item');
            const currentActive = container.querySelector('.suggestion-item.active');
            let activeIndex = currentActive ? parseInt(currentActive.dataset.index) : -1;
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    activeIndex = Math.min(activeIndex + 1, items.length - 1);
                    updateActiveItem(items, activeIndex);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    activeIndex = Math.max(activeIndex - 1, -1);
                    updateActiveItem(items, activeIndex);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (activeIndex >= 0 && items[activeIndex]) {
                        const text = items[activeIndex].querySelector('.suggestion-text').textContent;
                        selectSuggestion(text);
                    }
                    break;
                case 'Escape':
                    hideSuggestions();
                    break;
            }
        }

        // 활성 아이템 업데이트
        function updateActiveItem(items, activeIndex) {
            items.forEach((item, index) => {
                item.classList.toggle('active', index === activeIndex);
            });
        }

        // 인기 검색어 로드
        async function loadTrendingKeywords() {
            try {
                const response = await fetch('/api/trending-keywords?limit=20');
                const data = await response.json();
                
                if (data.success && data.trending_keywords.length > 0) {
                    showTrendingKeywords(data.trending_keywords);
                }
            } catch (error) {
                console.error('인기 검색어 로드 오류:', error);
            }
        }

        // 인기 검색어 표시
        function showTrendingKeywords(keywords) {
            const container = document.querySelector('.trending-keywords');
            if (!container) return;
            
            container.innerHTML = keywords.map(keyword => `
                <button class="trending-keyword" onclick="selectTrendingKeyword('${keyword.keyword}')">
                    ${keyword.keyword} (${keyword.count})
                </button>
            `).join('');
        }

        // 인기 검색어 선택
        function selectTrendingKeyword(keyword) {
            const keywordInput = document.getElementById('keyword');
            if (keywordInput) {
                keywordInput.value = keyword;
                keywordInput.focus();
            }
        }

        // 무한 스크롤 기능
        let isLoading = false;
        currentPage = 1;
        let hasMoreResults = true;

        // 무한 스크롤 초기화
        function initializeInfiniteScroll() {
            window.addEventListener('scroll', handleScroll);
        }

        // 스크롤 이벤트 처리
        async function handleScroll() {
            if (isLoading || !hasMoreResults) return;
            
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            
            // 스크롤이 하단에서 200px 이내에 도달했을 때
            if (scrollTop + windowHeight >= documentHeight - 200) {
                await loadMoreResults();
            }
        }

        // 더 많은 결과 로드
        async function loadMoreResults() {
            if (isLoading || !hasMoreResults) return;
            
            isLoading = true;
            currentPage++;
            
            try {
                // 현재 검색 조건으로 다음 페이지 요청
                const formData = new FormData(document.getElementById('searchForm'));
                const searchParams = new URLSearchParams();
                
                for (let [key, value] of formData.entries()) {
                    if (value) {
                        searchParams.append(key, value);
                    }
                }
                
                // 페이지 정보 추가
                searchParams.append('page', currentPage);
                searchParams.append('pageSize', 20);
                
                const response = await fetch(`/api/search?${searchParams.toString()}`);
                const data = await response.json();
                
                if (data.success && data.data.length > 0) {
                    // 기존 결과에 새 결과 추가
                    searchResults = [...searchResults, ...data.data];
                    allSearchResults = [...allSearchResults, ...data.data];
                    filteredResults = [...filteredResults, ...data.data];
                    
                    // 결과 렌더링
                    renderResults();
                    
                    // 더 이상 결과가 없으면 플래그 설정
                    if (data.data.length < 20) {
                        hasMoreResults = false;
                    }
                } else {
                    hasMoreResults = false;
                }
            } catch (error) {
                console.error('더 많은 결과 로드 오류:', error);
                hasMoreResults = false;
            } finally {
                isLoading = false;
            }
        }

        // 검색 시 무한 스크롤 상태 초기화
        function resetInfiniteScroll() {
            currentPage = 1;
            hasMoreResults = true;
            isLoading = false;
        }

        // 동영상 미리보기 기능
        function initializeVideoPreview() {
            // 썸네일 호버 시 미리보기 표시
            document.addEventListener('mouseover', (e) => {
                if (e.target.classList.contains('thumbnail')) {
                    const videoId = e.target.dataset.videoId;
                    if (videoId) {
                        showVideoPreview(videoId, e);
                    }
                }
            });
            
            document.addEventListener('mouseout', (e) => {
                if (e.target.classList.contains('thumbnail')) {
                    hideVideoPreview();
                }
            });
        }

        // 동영상 미리보기 표시
        function showVideoPreview(videoId, event) {
            hideVideoPreview(); // 기존 미리보기 제거
            
            const preview = document.createElement('div');
            preview.id = 'videoPreview';
            preview.className = 'video-preview';
            preview.innerHTML = `
                <div class="preview-content">
                    <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=0&controls=0&modestbranding=1&rel=0" 
                            width="300" height="200" frameborder="0" allowfullscreen></iframe>
                    <div class="preview-close" onclick="hideVideoPreview()">×</div>
                </div>
            `;
            
            // 위치 계산
            const rect = event.target.getBoundingClientRect();
            preview.style.left = `${rect.right + 10}px`;
            preview.style.top = `${rect.top}px`;
            
            document.body.appendChild(preview);
        }

        // 동영상 미리보기 숨기기
        function hideVideoPreview() {
            const preview = document.getElementById('videoPreview');
            if (preview) {
                preview.remove();
            }
        }

        // 북마크 기능
        function initializeBookmarks() {
            // 북마크 버튼 이벤트 리스너
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('bookmark-btn')) {
                    const videoId = e.target.dataset.videoId;
                    const videoTitle = e.target.dataset.videoTitle;
                    toggleBookmark(videoId, videoTitle, e.target);
                }
            });
        }

        // 북마크 토글
        function toggleBookmark(videoId, videoTitle, button) {
            const bookmarks = getBookmarks();
            const isBookmarked = bookmarks.some(bookmark => bookmark.videoId === videoId);
            
            if (isBookmarked) {
                // 북마크 제거
                const updatedBookmarks = bookmarks.filter(bookmark => bookmark.videoId !== videoId);
                localStorage.setItem('bookmarks', JSON.stringify(updatedBookmarks));
                button.innerHTML = '♡';
                button.classList.remove('bookmarked');
                showNotification('북마크에서 제거되었습니다.');
            } else {
                // 북마크 추가
                const newBookmark = {
                    videoId: videoId,
                    title: videoTitle,
                    addedAt: new Date().toISOString()
                };
                bookmarks.push(newBookmark);
                localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
                button.innerHTML = '♥';
                button.classList.add('bookmarked');
                showNotification('북마크에 추가되었습니다.');
            }
        }

        // 북마크 목록 가져오기
        function getBookmarks() {
            const bookmarks = localStorage.getItem('bookmarks');
            return bookmarks ? JSON.parse(bookmarks) : [];
        }

        // 북마크 상태 확인
        function isBookmarked(videoId) {
            const bookmarks = getBookmarks();
            return bookmarks.some(bookmark => bookmark.videoId === videoId);
        }

        // 알림 표시
        function showNotification(message) {
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 10000;
                animation: slideIn 0.3s ease;
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }

        // 초기화는 initializeApp에서 처리됨