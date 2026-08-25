import { buildVEventCopyDraft, buildVEventPresentInviteModel, buildVEventPublicLoadRpcArgs, buildVEventSwitchQuestionRpcArgs, buildVEventTouchParticipantRpcArgs, canEditVEventQuestionStructure, getVEventPresentLayout, parseVEventQuestionsFromText, type VEvent, type VEventQuestion, type VEventQuestionStats } from './vEvents.ts';

function makeEvent(patch: Partial<VEvent> = {}): VEvent {
  return {
    id: 'event-1',
    code: 'DAOTAOCMOOGO',
    title: 'Demo event',
    description: '',
    status: 'active',
    activeQuestionId: null,
    participationEnabled: true,
    resultsVisibility: 'instant',
    settings: {},
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
    ...patch,
  };
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertArrayEqual(actual: unknown[], expected: unknown[], message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}. Expected ${expectedJson}, received ${actualJson}`);
  }
}

function makeQuestion(patch: Partial<VEventQuestion> = {}): VEventQuestion {
  return {
    id: 'event-1-q1',
    eventId: 'event-1',
    questionNumber: 1,
    title: 'Question title',
    questionType: 'single_choice',
    options: [
      { id: 'old-a', label: 'Option A' },
      { id: 'old-b', label: 'Option B' },
    ],
    status: 'open',
    settings: {},
    openedAt: null,
    closedAt: null,
    ...patch,
  };
}

function testPresentInviteUsesEventCodeForQr() {
  const model = buildVEventPresentInviteModel(makeEvent());

  assertEqual(model.code, 'DAOTAOCMOOGO', 'Invite panel code should match event code');
  assertEqual(model.qrValue, '/v-events/join/DAOTAOCMOOGO', 'QR should point to the public join link');
  assertEqual(model.shortUrlLabel, 'v-events/join', 'Short URL label should stay compact for presentation');
}

function testPresentLayoutCyclesAcrossFourQuestions() {
  assertEqual(getVEventPresentLayout(1), 'bars', 'Question 1 should use the Mentimeter-style bars layout');
  assertEqual(getVEventPresentLayout(2), 'cards', 'Question 2 should keep the current card layout');
  assertEqual(getVEventPresentLayout(3), 'donut', 'Question 3 should use the soft donut layout');
  assertEqual(getVEventPresentLayout(4), 'scale', 'Question 4 should use the scale line layout');
  assertEqual(getVEventPresentLayout(5), 'bars', 'Question 5 should cycle back to bars');
}

function testBuildCopyDraftKeepsContentButCreatesNewIdentity() {
  const source = makeEvent({ title: 'Original event', code: 'HCMC26', description: 'Original description' });
  const draft = buildVEventCopyDraft(source, [makeQuestion()]);

  assertEqual(draft.title, 'Original event - bản copy', 'Copy draft should show editable copied title');
  assertEqual(draft.description, 'Original description', 'Copy draft should keep description');
  assertEqual(draft.code === source.code, false, 'Copy draft should not reuse the source code');
  assertEqual(draft.questions[0]?.id, 'q1', 'Copy draft should reset question id for new event creation');
  assertEqual(draft.questions[0]?.options[0]?.label, 'Option A', 'Copy draft should keep option labels');
}

function testPublicLoadRpcArgsDoNotTouchParticipantForBackgroundRefresh() {
  const args = buildVEventPublicLoadRpcArgs(' hcmc26 ', 'participant-1', { touchParticipant: false });

  assertEqual(args.p_code, 'HCMC26', 'Public load args should sanitize event code');
  assertEqual(args.p_participant_key, 'participant-1', 'Public load args should keep participant key for existing response lookup');
  assertEqual(args.p_touch_participant, false, 'Background refresh should not write participant heartbeat');
}

function testPublicLoadRpcArgsTouchParticipantByDefault() {
  const args = buildVEventPublicLoadRpcArgs('HCMC26', 'participant-1');

  assertEqual(args.p_touch_participant, true, 'Initial public load should touch participant heartbeat by default');
}

function testTouchParticipantRpcArgsSanitizeCodeAndKey() {
  const args = buildVEventTouchParticipantRpcArgs(' cmhv01 ', ' participant-1 ');

  assertEqual(args.p_code, 'CMHV01', 'Touch participant args should sanitize event code');
  assertEqual(args.p_participant_key, 'participant-1', 'Touch participant args should trim participant key');
}

function testSwitchQuestionRpcArgsTrimIds() {
  const args = buildVEventSwitchQuestionRpcArgs(' event-1 ', ' event-1-q2 ');

  assertEqual(args.p_event_id, 'event-1', 'Switch question args should trim event id');
  assertEqual(args.p_question_id, 'event-1-q2', 'Switch question args should trim question id');
}

function testParserKeepsLongBulletOptionsAndContinuationLines() {
  const text = [
    'Mentimeter 4',
    'Cau hoi: Theo Anh/Chi, doi voi EVNHCMC, khach hang thuong kho chiu nhat o diem cham nao?',
    'Cac dap an lua chon:',
    '- Qua kenh Tong dai/dien thoai.',
    '- Qua kenh Email/Zalo OA/Website',
    '- Qua App CSKH EVNHCMC',
    '- Khi phai trinh bay lai nhieu lan',
    '  cung 1 van de',
  ].join('\n');

  const questions = parseVEventQuestionsFromText(text);

  assertEqual(questions.length, 1, 'Parser should detect one Mentimeter question');
  assertArrayEqual(
    questions[0]?.options.map((option) => option.label) || [],
    [
      'Qua kenh Tong dai/dien thoai.',
      'Qua kenh Email/Zalo OA/Website',
      'Qua App CSKH EVNHCMC',
      'Khi phai trinh bay lai nhieu lan cung 1 van de',
    ],
    'Parser should keep full answer options and merge wrapped continuation lines',
  );
}

function testParserTreatsIndentedBulletsAsSeparateOptions() {
  const text = [
    'Mentimeter 4',
    'Cau hoi: Diem cham nao khach hang kho chiu nhat?',
    'Cac dap an lua chon:',
    '  - Qua kenh Tong dai/dien thoai.',
    '  - Qua kenh Email/Zalo OA/Website',
  ].join('\n');

  const questions = parseVEventQuestionsFromText(text);

  assertArrayEqual(
    questions[0]?.options.map((option) => option.label) || [],
    [
      'Qua kenh Tong dai/dien thoai.',
      'Qua kenh Email/Zalo OA/Website',
    ],
    'Indented bullet list items should stay as separate answer options',
  );
}

function testQuestionStructureCanBeEditedBeforeLiveResponses() {
  const question = makeQuestion({ status: 'pending' });

  assertEqual(canEditVEventQuestionStructure(question, []), true, 'Draft question without responses should allow answer structure edits');
}

function testQuestionStructureIsLockedWhenOpenOrAnswered() {
  const answeredStats: VEventQuestionStats[] = [
    { questionId: 'event-1-q1', optionId: 'old-a', label: 'Option A', count: 1, percent: 100 },
  ];

  assertEqual(canEditVEventQuestionStructure(makeQuestion({ status: 'open' }), []), false, 'Open question should lock answer structure edits');
  assertEqual(canEditVEventQuestionStructure(makeQuestion({ status: 'closed' }), answeredStats), false, 'Answered question should lock answer structure edits');
}

testPresentInviteUsesEventCodeForQr();
testPresentLayoutCyclesAcrossFourQuestions();
testBuildCopyDraftKeepsContentButCreatesNewIdentity();
testPublicLoadRpcArgsDoNotTouchParticipantForBackgroundRefresh();
testPublicLoadRpcArgsTouchParticipantByDefault();
testTouchParticipantRpcArgsSanitizeCodeAndKey();
testSwitchQuestionRpcArgsTrimIds();
testParserKeepsLongBulletOptionsAndContinuationLines();
testParserTreatsIndentedBulletsAsSeparateOptions();
testQuestionStructureCanBeEditedBeforeLiveResponses();
testQuestionStructureIsLockedWhenOpenOrAnswered();
console.log('vEventsPresent tests passed');
