## MCP 서버 재설정 단계

### 1단계: 현재 MCP 서버 종료

현재 실행 중인 MCP 서버를 종료하세요:

- 명령 프롬프트에서 **Ctrl+C** 눌러서 서버 종료

### 2단계: Claude 브라우저 완전 종료

- 모든 Claude 탭 닫기
- 브라우저 완전 종료

### 3단계: MCP 설정 확인

Claude 설정에서 MCP 서버 설정이 다음과 같은지 확인:

json

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "H:\\workspace\\"
      ]
    }
  }
}
```

### 4단계: MCP 서버 재시작

cmd

```cmd
cd H:\workspace\you001_time1
npx -y @modelcontextprotocol/server-filesystem H:\workspace\
```

서버가 다음과 같이 표시되면 정상:

```
Secure MCP Filesystem Server running on stdio
```

### 5단계: 브라우저 재시작

- 브라우저 재시작
- Claude.ai 재접속
- 이 대화로 복귀

### 6단계: 연결 테스트

연결이 정상인지 확인해보겠습니다:

F

List directory

요청

``{ `path`: `H:\\workspace\\you001_time1` }``

응답

`Tool execution failed`

아직 연결이 되지 않습니다. 위의 1-5단계를 모두 완료하셨나요?

완료하신 후 다시 연결 테스트를 해보겠습니다.

재시도

[Claude는 실수를 할 수 있습니다.  
응답을 반드시 다시 확인해 주세요.](https://support.anthropic.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on)

연구

Sonnet 4
