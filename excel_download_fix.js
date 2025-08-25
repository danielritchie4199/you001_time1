// Excel 다운로드 기능 수정 코드
// 이 코드를 you_list.html 파일의 JavaScript 섹션에 추가하세요

// Excel 다운로드 버튼 이벤트 리스너
document.getElementById('downloadExcelBtn').addEventListener('click', async () => {
    await downloadExcel();
});

// Excel 다운로드 함수
async function downloadExcel() {
    try {
        const button = document.getElementById('downloadExcelBtn');
        const originalText = button.innerHTML;
        
        // 버튼 상태 변경
        button.disabled = true;
        button.innerHTML = '📊 다운로드 중...';
        
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
        const url = window.URL.createObjectURL(blob);
        
        // 파일명 추출 (Content-Disposition 헤더에서)
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'YouTube_검색결과.xlsx';
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch) {
                filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
            }
        }
        
        // 다운로드 링크 생성 및 클릭
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // URL 객체 정리
        window.URL.revokeObjectURL(url);
        
        console.log('Excel 파일 다운로드 성공:', filename);
        alert(`✅ Excel 파일이 다운로드되었습니다!\n\n파일명: ${filename}\n결과 수: ${searchResults.length}건`);
        
    } catch (error) {
        console.error('Excel 다운로드 오류:', error);
        
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
            button.innerHTML = '📊';
        }
    }
}

// 선택된 국가 목록 반환 함수
function getSelectedCountries() {
    const countryCheckboxes = document.querySelectorAll('input[name="countries"]:checked');
    return Array.from(countryCheckboxes).map(cb => cb.value);
}

// 선택된 카테고리 목록 반환 함수  
function getSelectedCategories() {
    const categoryCheckboxes = document.querySelectorAll('input[name="categories"]:checked');
    return Array.from(categoryCheckboxes).map(cb => cb.value);
}

// performSearch 함수에서 Excel 버튼 표시 처리 (기존 함수에 추가)
function showExcelDownloadButton() {
    const excelBtn = document.getElementById('downloadExcelBtn');
    if (excelBtn && searchResults && searchResults.length > 0) {
        excelBtn.style.display = 'flex';
        console.log('Excel 다운로드 버튼 활성화:', searchResults.length, '개 결과');
    }
}

// performSearch 함수 마지막에 showExcelDownloadButton() 호출 추가 필요