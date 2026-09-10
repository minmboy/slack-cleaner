import type { ReactNode } from 'react'

/**
 * Korean strings. This object is the source of truth for the `Strings` type,
 * so every other language file must match its shape exactly — a missing or
 * misspelled key fails `tsc`.
 *
 * Prose that needs markup is written as JSX right here, and prose that needs a
 * value spliced into it is a function. That way each language owns its own word
 * order instead of having sentences stitched together from fragments.
 */
export const ko = {
  locale: 'ko-KR',
  langName: '한국어',

  app: {
    title: 'Slack 메시지 관리',
    badge: '서버 전송 없음 · 브라우저에서만 처리',
    badgeTip:
      '토큰과 메시지 내용이 이 브라우저를 벗어나지 않습니다. 모든 요청은 이 페이지에서 slack.com으로 직접 전송되며, 중간 서버가 없습니다.',
    disconnect: '연결 해제',
    revoke: '토큰 폐기',
    revokeTip: 'Slack에서 이 토큰을 즉시 무효화합니다',
    steps: {
      connect: '연결',
      select: '대화 선택',
      scan: '스캔',
      review: '확인',
      run: '삭제',
    },
    footer: (apiCode: ReactNode): ReactNode => (
      <>
        토큰과 메시지 내용은 이 브라우저 밖으로 나가지 않습니다. 모든 요청은 이 페이지에서 {apiCode}로 직접 전송되며,
        중간 서버가 없습니다.
      </>
    ),
    footerUserId: (userId: string) => ` · 내 user ID: ${userId}`,
    footerScanned: (count: string) => ` · 스캔된 내 메시지 ${count}개 (메모리에만 보관)`,

    errInvalidToken: '토큰이 유효하지 않습니다. User OAuth Token(xoxp-)을 다시 확인해 주세요.',
    errSlackResponse: (code: string) => `Slack 응답: ${code}`,
    errUnreachable:
      '요청이 Slack에 닿지 않았습니다. 네트워크 또는 확장 프로그램(광고 차단기 등)이 막고 있는지 확인해 주세요.',
    errMissingScope: (needed: string) =>
      `선택한 대화 종류에 필요한 스코프가 없습니다 (${needed}). 매니페스트에 추가하고 앱을 재설치하세요.`,
    errListFailed: (code: string) => `대화 목록을 불러오지 못했습니다: ${code}`,
    errListUnreachable: '대화 목록 요청이 Slack에 닿지 않았습니다.',

    userDeactivated: ' (해제된 계정)',
    userIsApp: ' (앱)',
    skippedNotice: (count: number, detail: string) => `${count}개 대화를 건너뛰었습니다: ${detail}`,
    routeNotRestorable:
      '스캔 결과는 메모리에만 있어서 링크나 새로고침으로 그 화면을 복원할 수 없습니다. 대화를 다시 선택해 주세요.',
    kindsClamped: '링크의 대화 종류 일부를 인식하지 못해 기본값으로 되돌렸습니다.',
    scanFailed: (code: string) => `스캔이 중간에 실패했습니다 (${code}). 대화를 다시 선택해 주세요.`,
    lastRunNote: '이번 세션의 삭제 결과가 남아 있습니다. 새로 스캔하기 전까지 다시 보거나 내보낼 수 있습니다.',
    lastRunView: '결과 보기',
    noneFound: '선택한 대화에서 내가 쓴 메시지를 찾지 못했습니다.',
    backToSelect: '대화 다시 선택',
  },

  export: {
    listLabel: '목록 내보내기',
    resultsLabel: '결과 내보내기',
    csv: 'CSV',
    json: 'JSON',
    containsText: (
      <>
        내보낸 파일에는 <b>메시지 본문이 그대로 들어갑니다.</b> 삭제 전 백업으로 쓰기 좋지만, 그만큼 파일 자체를 안전한
        곳에 두세요.
      </>
    ),
  },

  ui: {
    copy: '복사',
    copied: '복사됨',
    copyFailed: '복사 실패',
  },

  kind: {
    long: {
      im: '1:1 DM',
      mpim: '그룹 DM',
      private_channel: '비공개 채널',
      public_channel: '공개 채널',
    },
    short: {
      im: 'DM',
      mpim: '그룹',
      private_channel: '비공개',
      public_channel: '공개',
    },
  },

  gate: {
    setupTitle: '1. Slack 앱 만들고 User Token 발급받기',
    intro: (slackCode: ReactNode, secretCode: ReactNode): ReactNode => (
      <>
        이 도구는 <b>백엔드가 없습니다.</b> 토큰은 브라우저 안에만 머물고, 모든 요청은 이 페이지에서 {slackCode}으로 직접
        나갑니다. 그래서 표준 OAuth({secretCode} 필요) 대신, 본인이 직접 앱을 만들어 토큰을 붙여넣는 방식을 씁니다. 부수
        효과로 <b>2025년부터 강화된 조회 rate limit도 면제</b>됩니다 — 직접 만든 내부용 앱은 대상이 아니기 때문입니다.
      </>
    ),
    step1Title: (link: ReactNode): ReactNode => <>{link} → Create New App → From a manifest</>,
    step1Body: '정리하려는 워크스페이스를 고르고, YAML 탭에 아래 내용을 붙여넣습니다.',
    step2Title: 'Install to Workspace',
    step2Body: (
      <>
        앱 생성 후 <b>OAuth &amp; Permissions</b> 화면에서 설치합니다. 권한 동의 화면에 요청한 스코프가 그대로 보입니다.
      </>
    ),
    step3Title: (tokenCode: ReactNode): ReactNode => (
      <>
        <b>User</b> OAuth Token 복사 {tokenCode}
      </>
    ),
    step3Body: (botCode: ReactNode): ReactNode => (
      <>
        같은 화면 위쪽의 {botCode}(Bot Token)가 아닙니다. Bot Token으로는 내 메시지를 삭제할 수 없습니다.
      </>
    ),

    manifest: `display_information:
  name: My Message Manager
  description: 내 Slack 메시지 관리 도구
  background_color: "#131110"
oauth_config:
  scopes:
    user:
      # --- 1:1 DM (필수) ---
      - im:read
      - im:history
      - users:read
      - chat:write
      # --- 첨부파일도 함께 삭제하려면 유지 ---
      - files:write
      # --- 그룹 DM / 채널까지 정리하려면 유지, 아니면 삭제 ---
      - mpim:read
      - mpim:history
      - groups:read
      - groups:history
      - channels:read
      - channels:history
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
`,

    pasteTitle: '2. 토큰 붙여넣기',
    tokenLabel: 'User OAuth Token',
    botTokenError: (botCode: ReactNode, userCode: ReactNode): ReactNode => (
      <>
        <b>Bot Token입니다.</b> {botCode}로 시작하는 토큰은 봇이 보낸 메시지만 지울 수 있습니다. {userCode}로 시작하는
        User OAuth Token을 사용하세요.
      </>
    ),
    oddPrefixWarning: (userCode: ReactNode): ReactNode => (
      <>일반적인 User Token은 {userCode}로 시작합니다. 그래도 시도해 볼 수 있습니다.</>
    ),
    remember: '이 탭에서만 기억 (sessionStorage · 탭을 닫으면 사라짐)',
    connect: '연결',
    connecting: '확인 중…',

    knowTitle: '알아두어야 할 것',
    irreversible: (
      <>
        <b>삭제는 되돌릴 수 없습니다.</b> 실행 전에 삭제 대상 메시지를 하나하나 확인할 수 있는 단계를 거칩니다.
      </>
    ),
    bulletOwnOnly: (
      <>
        삭제 대상은 <b>내가 쓴 메시지뿐</b>입니다. 상대방 메시지는 목록에도 오르지 않고, User Token 자체가 Slack 수준에서
        그럴 권한이 없습니다.
      </>
    ),
    bulletPolicy: (code: ReactNode): ReactNode => (
      <>
        워크스페이스 관리자가 <b>메시지 삭제를 금지</b>해 뒀다면 개별 메시지가 {code}로 실패할 수 있습니다. 우회하지 않고
        실패로 기록합니다.
      </>
    ),
    bulletRetention: (
      <>
        이건 <b>Slack에서 메시지를 지우는 것</b>이지, 회사의 export/Discovery 백업에서 지우는 게 아닙니다. 조직 보존
        정책에 따라 기록은 남아 있을 수 있습니다.
      </>
    ),
    bulletFiles: (code: ReactNode): ReactNode => (
      <>
        첨부 <b>파일은 지워지지 않습니다</b> ({code}는 별도 기능).
      </>
    ),
  },

  picker: {
    title: '대화 선택',
    loading: '불러오는 중…',
    count: (count: string) => `${count}개`,
    namesPending: (count: string) => ` · 이름 확인 중 ${count}개`,
    kindsLabel: '대화 종류',
    scopeTip: (scopes: string) => `필요 스코프: ${scopes}`,
    rangeLabel: '스캔 범위',
    rangeHint:
      '이후 메시지만 조회합니다. 비워 두면 전체 — 오래된 대화는 그만큼 시간이 걸립니다. 날짜를 지정하면 그 이전에 시작된 스레드 안의 답글은 찾지 못합니다.',
    nonDmWarning: (code: ReactNode): ReactNode => (
      <>
        DM 외의 대화를 포함했습니다. 해당 스코프가 매니페스트에 없으면 그 대화만 {code}로 건너뛰고, 나머지는 정상
        진행됩니다.
      </>
    ),
    historyScanned: (date: string, count: string) => `스캔 ${date} · ${count}개`,
    historySince: (since: string) => ` (${since}~)`,
    historyDeleted: (date: string, count: string) => `삭제 ${date} · 누적 ${count}개`,
    clearHistory: '이력 지우기',
    clearHistoryTip:
      '이 브라우저에 저장된 대화별 스캔·삭제 이력(대화 ID, 날짜, 개수)을 지웁니다. 메시지 본문과 이름은 처음부터 저장하지 않습니다.',
    searchPlaceholder: '이름 또는 ID 검색',
    selectVisible: '보이는 항목 전체 선택',
    deselectVisible: '보이는 항목 해제',
    emptyLoading: '대화 목록을 불러오고 있습니다…',
    emptyNone: '조건에 맞는 대화가 없습니다.',
    selectedSummary: (count: ReactNode): ReactNode => <>선택 {count}개 대화</>,
    scanButton: '내 메시지 스캔',
  },

  scan: {
    title: '스캔 중',
    stop: '중단',
    statConversations: '대화',
    statSeen: '조회한 메시지',
    statMine: '내 메시지',
    rateLimitNote: (seconds: ReactNode): ReactNode => (
      <>Slack rate limit에 걸려 {seconds} 대기 중입니다. 그대로 두면 자동으로 이어집니다.</>
    ),
    throttleNote: (
      <>
        한 번에 <b>15개</b>씩만 응답이 옵니다 — Slack Marketplace 미승인 배포 앱에 적용되는 강화 제한(분당 1회)에 걸린
        상태로 보입니다. 앱 설정에서 <b>Distribution을 끄고(비공개 유지)</b> 재설치하면 내부용 앱으로 분류돼 제한이
        풀립니다.
      </>
    ),
    threadNote: (done: string, found: string) => ` · 스레드 ${done}/${found}`,
    lineSummary: (seen: string, threads: string, mine: ReactNode): ReactNode => (
      <>
        {seen}개 조회{threads} · 내 메시지 {mine}
      </>
    ),
    skippedTitle: (count: number) => `건너뛴 대화 ${count}개`,
    seconds: (seconds: number) => `${seconds}초`,
  },

  review: {
    title: '삭제 대상 확인',
    found: (count: string) => `내 메시지 ${count}개 발견`,
    filtered: (count: string) => ` · 필터 결과 ${count}개`,
    intro: (replyBadge: ReactNode, parentBadge: ReactNode): ReactNode => (
      <>
        기본적으로 <b>전부 선택</b>돼 있습니다. 남기고 싶은 메시지의 체크를 해제하세요. 스레드 답글은 {replyBadge},
        스레드 원본은 {parentBadge}으로 표시됩니다.
      </>
    ),
    textPlaceholder: '본문에 포함된 단어',
    onlyThreads: '스레드만',
    onlyFiles: '첨부 있는 것만',
    resetFilters: '필터 초기화',
    toolbarFiltered: (total: string, selected: string) => `필터 결과 ${total}개 중 ${selected}개 선택`,
    toolbarAll: (selected: string) => `${selected}개 선택`,
    selectFiltered: '필터 결과 전체 선택',
    deselectFiltered: '필터 결과 전체 해제',
    selectAll: '전체 선택',
    deselectAll: '전체 해제',
    listLabel: '삭제 대상 메시지 목록',
    listPosition: (from: string, to: string, total: string) => `${from}–${to} / ${total}`,
    emptyNone: '조건에 맞는 메시지가 없습니다.',
    groupSelect: '선택',
    groupDeselect: '해제',
    badgeReply: '답글',
    badgeParent: '원본',
    badgeFiles: '첨부',
    noText: '(본문 없음)',
    backToSelect: '대화 다시 선택',
    pending: (count: ReactNode): ReactNode => <>삭제 예정 {count}개</>,
    proceed: '삭제 진행',
  },

  confirm: {
    title: '최종 확인',
    /** Must be typed exactly to arm the delete button. */
    phrase: '삭제',
    warning: (count: ReactNode): ReactNode => <>{count}개의 내 메시지를 삭제합니다. 되돌릴 수 없습니다.</>,
    estimate: (minutes: ReactNode): ReactNode => (
      <>Slack 속도 제한(분당 최대 60회) 때문에 약 {minutes} 걸립니다. 탭은 닫지 마세요 — 다른 탭으로 옮겨도 계속됩니다.</>
    ),
    minutes: (count: string) => `${count}분`,
    filesOptIn: (count: string) => `내가 올린 첨부파일 ${count}개도 함께 삭제`,
    filesScopeWarning: (
      <>
        파일은 특정 대화에 속하지 않습니다. <b>삭제하면 여기서 선택하지 않은 대화를 포함해, 공유된 모든 곳에서
        사라집니다.</b>
      </>
    ),
    filesKept: (count: string) => `체크하지 않으면 파일 ${count}개는 Slack에 그대로 남습니다.`,
    filesNotMine: (count: string) =>
      `이 중 ${count}개 메시지에 첨부파일이 있지만 내가 올린 것이 아니라 삭제할 수 없습니다. 파일은 그대로 남습니다.`,
    dryRun: '연습 실행 — 실제로 지우지 않고 순서와 대상만 확인',
    typePrompt: (phrase: ReactNode): ReactNode => <>진행하려면 {phrase} 를 입력하세요</>,
    cancel: '취소',
    startDryRun: '연습 실행',
    startDelete: (count: string) => `${count}개 삭제`,
  },

  run: {
    titleDryRunning: '연습 실행 중',
    titleRunning: '삭제 중',
    titleDryDone: '연습 실행 완료',
    titleDone: '완료',
    titlePaused: '일시정지됨',
    titleDryPaused: '연습 실행 일시정지됨',
    pause: '일시정지',
    resume: (count: string) => `이어서 삭제 · ${count}개 남음`,
    eta: (left: string, rate: string) => `남은 시간 ${left} · 분당 ${rate}개`,
    etaMinutes: (count: string) => `약 ${count}분`,
    etaUnderMinute: '1분 미만',
    keepOpen:
      '탭은 닫지 마세요. 다른 탭으로 옮겨도 계속되지만, 탭을 닫거나 컴퓨터가 잠들면 멈춥니다. 멈추면 같은 대화를 다시 스캔해서 남은 것만 이어서 지울 수 있습니다.',
    statTarget: '대상',
    statDeleted: '삭제됨',
    statAlreadyGone: '이미 없음',
    statNotAllowed: '권한 없음',
    statFailed: '실패',
    statFiles: '삭제한 파일',
    rateLimitNote: (seconds: ReactNode): ReactNode => <>Slack rate limit — {seconds} 대기 후 자동으로 이어집니다.</>,
    seconds: (seconds: number) => `${seconds}초`,
    abortedNote: (code: ReactNode, remaining: string): ReactNode => (
      <>
        {code} 때문에 중단했습니다. 토큰이 만료·회수됐거나 스코프가 부족한 경우입니다. 남은 {remaining}개는 처리되지
        않았습니다.
      </>
    ),
    notAllowedNote: (count: string, code: ReactNode): ReactNode => (
      <>
        {count}개는 Slack이 삭제를 거부했습니다 ({code}). 워크스페이스 관리자가 구성원의 메시지 삭제를 제한해 둔 경우가
        대부분입니다.
      </>
    ),
    retryFailed: (count: string) => `실패한 ${count}개 재시도`,
    leaveHint: '떠나기 전에 결과를 내보내 두세요. 새로 스캔하면 이 결과는 사라집니다.',
    kindMessage: '메시지',
    kindFile: '파일',
    thKind: '종류',
    thConversation: '대화',
    thTarget: '대상',
    thOutcome: '결과',
    thCode: '코드',
    outcome: {
      deleted: '삭제됨',
      already_gone: '이미 없음',
      not_allowed: '권한 없음',
      failed: '실패',
      skipped: '연습',
    },
  },
}

export type Strings = typeof ko
