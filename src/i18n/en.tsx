import type { ReactNode } from 'react'
import type { Strings } from './ko'

/** English strings. Typed against `Strings`, so `tsc` catches any key ko has and this does not. */
export const en: Strings = {
  locale: 'en-US',
  langName: 'English',

  app: {
    title: 'Slack Message Cleanup',
    badge: 'No server · runs entirely in your browser',
    badgeTip:
      'Your token and message contents never leave this browser. Every request goes straight from this page to slack.com, with no server in between.',
    disconnect: 'Disconnect',
    revoke: 'Revoke token',
    revokeTip: 'Invalidates this token in Slack immediately',
    steps: {
      connect: 'Connect',
      select: 'Pick conversations',
      scan: 'Scan',
      review: 'Review',
      run: 'Delete',
    },
    footer: (apiCode: ReactNode): ReactNode => (
      <>
        Your token and message contents never leave this browser. Every request goes straight from this page to{' '}
        {apiCode}, with no server in between.
      </>
    ),
    footerUserId: (userId: string) => ` · your user ID: ${userId}`,
    footerScanned: (count: string) => ` · ${count} of your messages scanned (held in memory only)`,

    errInvalidToken: 'That token is not valid. Double-check the User OAuth Token (xoxp-).',
    errSlackResponse: (code: string) => `Slack replied: ${code}`,
    errUnreachable:
      'The request never reached Slack. Check your network, or whether an extension (ad blocker and the like) is blocking it.',
    errMissingScope: (needed: string) =>
      `Missing the scope needed for the conversation types you picked (${needed}). Add it to the manifest and reinstall the app.`,
    errListFailed: (code: string) => `Could not load the conversation list: ${code}`,
    errListUnreachable: 'The conversation list request never reached Slack.',

    userDeactivated: ' (deactivated)',
    userIsApp: ' (app)',
    skippedNotice: (count: number, detail: string) =>
      `Skipped ${count} conversation${count === 1 ? '' : 's'}: ${detail}`,
    routeNotRestorable:
      'Scan results live in memory only, so that screen cannot be restored from a link or a reload. Pick conversations again.',
    kindsClamped: 'Some conversation types in that link were not recognised, so they were reset to the default.',
    scanFailed: (code: string) => `The scan failed partway through (${code}). Pick conversations and try again.`,
    noneFound: 'No messages of yours were found in the conversations you picked.',
    backToSelect: 'Pick conversations again',
  },

  export: {
    listLabel: 'Export list',
    resultsLabel: 'Export results',
    csv: 'CSV',
    json: 'JSON',
    containsText: (
      <>
        The exported file contains <b>your message text, verbatim.</b> That makes it a useful backup to take
        before deleting — and a file worth keeping somewhere safe.
      </>
    ),
  },

  ui: {
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
  },

  kind: {
    long: {
      im: 'Direct message',
      mpim: 'Group DM',
      private_channel: 'Private channel',
      public_channel: 'Public channel',
    },
    short: {
      im: 'DM',
      mpim: 'Group',
      private_channel: 'Private',
      public_channel: 'Public',
    },
  },

  gate: {
    setupTitle: '1. Create a Slack app and get a User Token',
    intro: (slackCode: ReactNode, secretCode: ReactNode): ReactNode => (
      <>
        This tool has <b>no backend.</b> Your token stays inside the browser, and every request goes from this page
        straight to {slackCode}. That rules out standard OAuth, which needs a {secretCode}, so instead you create your
        own app and paste its token. A useful side effect: you are{' '}
        <b>exempt from the stricter read rate limits introduced in 2025</b>, because apps you build for your own
        workspace are not subject to them.
      </>
    ),
    step1Title: (link: ReactNode): ReactNode => <>{link} → Create New App → From a manifest</>,
    step1Body: 'Pick the workspace you want to clean up, then paste the following into the YAML tab.',
    step2Title: 'Install to Workspace',
    step2Body: (
      <>
        Install from the <b>OAuth &amp; Permissions</b> page once the app exists. The consent screen lists exactly the
        scopes requested below.
      </>
    ),
    step3Title: (tokenCode: ReactNode): ReactNode => (
      <>
        Copy the <b>User</b> OAuth Token {tokenCode}
      </>
    ),
    step3Body: (botCode: ReactNode): ReactNode => (
      <>Not the {botCode} (Bot Token) above it — a bot token cannot delete your messages.</>
    ),

    manifest: `display_information:
  name: My Message Cleaner
  description: Cleans up my own Slack messages
  background_color: "#131110"
oauth_config:
  scopes:
    user:
      # --- 1:1 DMs (required) ---
      - im:read
      - im:history
      - users:read
      - chat:write
      # --- keep to delete attachments as well ---
      - files:write
      # --- keep these for group DMs and channels, otherwise delete them ---
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

    pasteTitle: '2. Paste the token',
    tokenLabel: 'User OAuth Token',
    botTokenError: (botCode: ReactNode, userCode: ReactNode): ReactNode => (
      <>
        <b>That is a Bot Token.</b> A token starting with {botCode} can only delete messages the bot itself posted. Use
        the User OAuth Token, which starts with {userCode}.
      </>
    ),
    oddPrefixWarning: (userCode: ReactNode): ReactNode => (
      <>User tokens normally start with {userCode}. You can still try it.</>
    ),
    remember: 'Remember in this tab only (sessionStorage · cleared when the tab closes)',
    connect: 'Connect',
    connecting: 'Checking…',

    knowTitle: 'What you should know',
    irreversible: (
      <>
        <b>Deletion cannot be undone.</b> You get a step to review every message individually before anything runs.
      </>
    ),
    bulletOwnOnly: (
      <>
        Only <b>messages you wrote</b> are ever targeted. Other people's messages never even reach the list, and a user
        token has no authority to touch them at the Slack level.
      </>
    ),
    bulletPolicy: (code: ReactNode): ReactNode => (
      <>
        If a workspace admin has <b>disabled message deletion</b>, individual messages may fail with {code}. This tool
        records the failure rather than working around it.
      </>
    ),
    bulletRetention: (
      <>
        This <b>deletes messages in Slack</b>. It does not delete them from your company's export or Discovery backups —
        records may survive under your organization's retention policy.
      </>
    ),
    bulletFiles: (code: ReactNode): ReactNode => (
      <>
        Attached <b>files are not deleted</b> ({code} is a separate capability).
      </>
    ),
  },

  picker: {
    title: 'Pick conversations',
    loading: 'Loading…',
    count: (count: string) => `${count} conversation${count === '1' ? '' : 's'}`,
    namesPending: (count: string) => ` · resolving ${count} name${count === '1' ? '' : 's'}`,
    kindsLabel: 'Types',
    scopeTip: (scopes: string) => `Requires scopes: ${scopes}`,
    rangeLabel: 'Scan from',
    rangeHint:
      'Only fetches messages after this date. Leave empty for everything — long histories take proportionally longer. With a date set, replies inside threads that started before it are not found.',
    nonDmWarning: (code: ReactNode): ReactNode => (
      <>
        You included conversations beyond DMs. If the manifest is missing the matching scope, only those conversations
        are skipped with {code} — the rest proceed normally.
      </>
    ),
    searchPlaceholder: 'Search by name or ID',
    selectVisible: 'Select all visible',
    deselectVisible: 'Deselect visible',
    emptyLoading: 'Loading the conversation list…',
    emptyNone: 'No conversations match.',
    selectedSummary: (count: ReactNode): ReactNode => <>{count} conversations selected</>,
    scanButton: 'Scan my messages',
  },

  scan: {
    title: 'Scanning',
    stop: 'Stop',
    statConversations: 'Conversations',
    statSeen: 'Messages read',
    statMine: 'Mine',
    rateLimitNote: (seconds: ReactNode): ReactNode => (
      <>Slack rate-limited us — waiting {seconds}. Leave this open and it resumes on its own.</>
    ),
    throttleNote: (
      <>
        Only <b>15 items</b> are coming back per request — the signature of the stricter limit (one request per minute)
        Slack applies to distributed apps not approved for the Marketplace. Turning{' '}
        <b>Distribution off (keeping the app private)</b> and reinstalling reclassifies it as an internal app and lifts
        the limit.
      </>
    ),
    threadNote: (done: string, found: string) => ` · threads ${done}/${found}`,
    lineSummary: (seen: string, threads: string, mine: ReactNode): ReactNode => (
      <>
        {seen} read{threads} · mine {mine}
      </>
    ),
    skippedTitle: (count: number) => `${count} conversation${count === 1 ? '' : 's'} skipped`,
    seconds: (seconds: number) => `${seconds}s`,
  },

  review: {
    title: 'Review what gets deleted',
    found: (count: string) => `${count} of your messages found`,
    filtered: (count: string) => ` · ${count} after filters`,
    intro: (replyBadge: ReactNode, parentBadge: ReactNode): ReactNode => (
      <>
        Everything is <b>selected by default</b>. Uncheck anything you want to keep. Thread replies are marked{' '}
        {replyBadge} and thread roots {parentBadge}.
      </>
    ),
    textPlaceholder: 'Contains this word',
    onlyThreads: 'Threads only',
    onlyFiles: 'With attachments only',
    resetFilters: 'Reset filters',
    toolbarFiltered: (total: string, selected: string) => `${selected} of ${total} filtered messages selected`,
    toolbarAll: (selected: string) => `${selected} selected`,
    selectFiltered: 'Select all filtered',
    deselectFiltered: 'Deselect all filtered',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    listLabel: 'Messages staged for deletion',
    listPosition: (from: string, to: string, total: string) => `${from}–${to} of ${total}`,
    emptyNone: 'No messages match.',
    groupSelect: 'Select',
    groupDeselect: 'Deselect',
    badgeReply: 'reply',
    badgeParent: 'root',
    badgeFiles: 'file',
    noText: '(no text)',
    backToSelect: 'Pick conversations again',
    pending: (count: ReactNode): ReactNode => <>{count} staged for deletion</>,
    proceed: 'Delete these',
  },

  confirm: {
    title: 'Final confirmation',
    phrase: 'delete',
    warning: (count: ReactNode): ReactNode => (
      <>Deleting {count} of your own messages. This cannot be undone.</>
    ),
    estimate: (minutes: ReactNode): ReactNode => (
      <>
        Slack's rate limit (50 per minute) means this takes about {minutes}. Leave the tab open.
      </>
    ),
    minutes: (count: string) => `${count} min`,
    filesOptIn: (count: string) => `Also delete the ${count} file${count === '1' ? '' : 's'} I uploaded`,
    filesScopeWarning: (
      <>
        A file does not belong to one conversation. <b>Deleting it removes the file from everywhere it was
        shared, including conversations not selected here.</b>
      </>
    ),
    filesKept: (count: string) => `Leave this unchecked and ${count} file${count === '1' ? '' : 's'} stay in Slack.`,
    filesNotMine: (count: string) =>
      `${count} of these messages carry attachments someone else uploaded, so they cannot be deleted here and will remain.`,
    dryRun: 'Dry run — check the order and targets without deleting anything',
    typePrompt: (phrase: ReactNode): ReactNode => <>Type {phrase} to proceed</>,
    cancel: 'Cancel',
    startDryRun: 'Run dry',
    startDelete: (count: string) => `Delete ${count}`,
  },

  run: {
    titleDryRunning: 'Dry run in progress',
    titleRunning: 'Deleting',
    titleDryDone: 'Dry run complete',
    titleDone: 'Done',
    stop: 'Stop',
    statTarget: 'Targets',
    statDeleted: 'Deleted',
    statAlreadyGone: 'Already gone',
    statNotAllowed: 'Not allowed',
    statFailed: 'Failed',
    statFiles: 'Files deleted',
    rateLimitNote: (seconds: ReactNode): ReactNode => (
      <>Slack rate limit — resuming automatically in {seconds}.</>
    ),
    seconds: (seconds: number) => `${seconds}s`,
    abortedNote: (code: ReactNode, remaining: string): ReactNode => (
      <>
        Stopped because of {code}. That means the token expired or was revoked, or a scope is missing. The remaining{' '}
        {remaining} were not processed.
      </>
    ),
    notAllowedNote: (count: string, code: ReactNode): ReactNode => (
      <>
        Slack refused to delete {count} of them ({code}). Usually this means a workspace admin has restricted members
        from deleting their own messages.
      </>
    ),
    retryFailed: (count: string) => `Retry ${count} failed`,
    restart: 'Start over',
    kindMessage: 'Message',
    kindFile: 'File',
    thKind: 'Kind',
    thConversation: 'Conversation',
    thTarget: 'Target',
    thOutcome: 'Outcome',
    thCode: 'Code',
    outcome: {
      deleted: 'Deleted',
      already_gone: 'Already gone',
      not_allowed: 'Not allowed',
      failed: 'Failed',
      skipped: 'Dry run',
    },
  },
}
