import { enforceRateLimit } from './_rate-limit.js';

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.msg || data?.message || JSON.stringify(data);
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function buildHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseChecklistValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeChecklistRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({ ...row, checklist: parseChecklistValue(row?.checklist) }));
}

function toAuthProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    authUserId: profile.auth_user_id || null,
    email: profile.email || null,
    fullName: profile.full_name,
    role: profile.role,
    companyId: profile.company_id || null,
    organizationId: profile.organization_id || null,
    title: profile.title || null,
    accessScope: profile.access_scope || 'self',
    phone: null,
    avatarUrl: null,
  };
}

function readTrackingAssignments(order) {
  const raw = order?.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {};
  const assignments = raw.tracking_assignments;
  return assignments && typeof assignments === 'object' ? assignments : {};
}

function getTrackingProductId(key, assignment) {
  return String(assignment?.productId || key.split('::')[0] || '').trim();
}

function parseTrackingStageIndex(key, assignment) {
  const rawStageCode = String(assignment?.stageCode || key.split('::')[1] || '').trim();
  const match = rawStageCode.match(/^(?:SMF|VSMF|GSMF|CP)-?(\d{2})$/i);
  if (!match) return null;
  const stageIndex = Number(match[1]) - 1;
  return Number.isFinite(stageIndex) && stageIndex >= 0 ? stageIndex : null;
}

function normalizeTrackingTaskStatus(status) {
  const value = String(status || '').trim();
  if (!value || value === 'not_started') return 'todo';
  if (value === 'completed') return 'done';
  return value;
}

function parseStageIndices(raw) {
  if (!raw) return null;
  const parsed = String(raw)
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0);
  if (!parsed.length) return null;
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function shouldIncludeStageIndex(stageFilterSet, stageIndex) {
  if (!stageFilterSet) return true;
  const normalized = Number(stageIndex);
  if (!Number.isFinite(normalized) || normalized < 0) return false;
  return stageFilterSet.has(normalized);
}

function profileMatchesProfileId(profileId, viewer, profiles) {
  if (!profileId || !viewer) return false;
  const assignedProfile = profiles.find((entry) => entry.id === profileId);
  const assignedEmail = normalizeEmail(assignedProfile?.email);
  const viewerEmail = normalizeEmail(viewer.email);
  if (assignedEmail && viewerEmail) return assignedEmail === viewerEmail;
  return profileId === viewer.id;
}

function taskAssignedToViewer(task, viewer, profiles) {
  if (!task || !viewer) return false;
  const viewerEmail = normalizeEmail(viewer.email);
  const assignedProfile = profiles.find((entry) => entry.id === task.assignee_profile_id);
  const assignedEmail = normalizeEmail(assignedProfile?.email);
  if (viewerEmail && assignedEmail) return viewerEmail === assignedEmail;
  if (task.assignee_account_id && viewer.authUserId) return task.assignee_account_id === viewer.authUserId;
  if (task.assignee_profile_id) return task.assignee_profile_id === viewer.id;
  return false;
}

function trackingAssignedToViewer(assignment, viewer, profiles) {
  if (!assignment || !viewer) return false;
  const viewerEmail = normalizeEmail(viewer.email);
  const assignedEmail = normalizeEmail(assignment.assigneeEmail);
  if (viewerEmail && assignedEmail) return viewerEmail === assignedEmail;
  if (profileMatchesProfileId(assignment.assigneeProfileId, viewer, profiles)) return true;
  return false;
}

function canSeeAllAssignments(viewer) {
  return ['admin', 'content_manager', 'production_manager', 'pm'].includes(String(viewer?.role || '').toLowerCase());
}

async function fetchViewerProfileByEmail(supabaseUrl, headers, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const rows = await requestJson(
    `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,email,full_name,role,company_id,organization_id,title,active,access_scope,auth_user_id&email=${encodeURIComponent(`eq.${normalizedEmail}`)}&active=is.true&limit=1`,
    { headers },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

function buildWorkItems(input) {
  const { viewerProfile, profiles, orders, tasks, stageFilterSet } = input;
  if (!viewerProfile) return [];

  const itemsByStage = new Map();
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const includeAll = canSeeAllAssignments(viewerProfile);

  for (const task of tasks) {
    if (task.archived) continue;
    if (!shouldIncludeStageIndex(stageFilterSet, task.stage_index)) continue;
    if (!includeAll && !taskAssignedToViewer(task, viewerProfile, profiles)) continue;
    const assignedProfile = profiles.find((entry) => entry.id === task.assignee_profile_id);
    itemsByStage.set(`${task.order_id}::${task.product_id}::${task.stage_index}`, {
      id: task.id,
      taskId: task.id,
      order_id: task.order_id,
      product_id: task.product_id,
      stage_index: Number(task.stage_index || 0),
      status: task.status || 'todo',
      progress: Number(task.progress || 0),
      due_date: task.due_date || null,
      assignee: task.assignee || null,
      assignee_profile_id: task.assignee_profile_id || null,
      assignee_account_id: task.assignee_account_id || null,
      assignee_email: assignedProfile?.email || null,
      source: 'task',
    });
  }

  for (const order of orders) {
    const assignments = readTrackingAssignments(order);
    for (const [assignmentKey, assignment] of Object.entries(assignments)) {
      if (!assignment || typeof assignment !== 'object') continue;
      if (!includeAll && !trackingAssignedToViewer(assignment, viewerProfile, profiles)) continue;
      const productId = getTrackingProductId(assignmentKey, assignment);
      const stageIndex = parseTrackingStageIndex(assignmentKey, assignment);
      if (!productId || stageIndex === null) continue;
      if (!shouldIncludeStageIndex(stageFilterSet, stageIndex)) continue;

      const stageKey = `${order.id}::${productId}::${stageIndex}`;
      if (itemsByStage.has(stageKey)) continue;

      const dueDate = String(assignment.plannedDeadline || orderById.get(order.id)?.deadline || '').slice(0, 10) || null;
      let status = normalizeTrackingTaskStatus(assignment.checkpointStatus);
      if (status !== 'done' && dueDate && new Date(`${dueDate}T23:59:59`).getTime() < Date.now()) {
        status = 'overdue';
      }

      itemsByStage.set(stageKey, {
        id: `tracking:${stageKey}`,
        taskId: null,
        order_id: order.id,
        product_id: productId,
        stage_index: stageIndex,
        status,
        progress: status === 'done' ? 100 : 0,
        due_date: dueDate,
        assignee: assignment.assigneeName || viewerProfile.fullName || null,
        assignee_profile_id: assignment.assigneeProfileId || null,
        assignee_account_id: null,
        assignee_email: normalizeEmail(assignment.assigneeEmail) || null,
        source: 'tracking',
      });
    }
  }

  return [...itemsByStage.values()].sort(
    (a, b) =>
      String(a.due_date || '').localeCompare(String(b.due_date || '')) ||
      Number(a.stage_index) - Number(b.stage_index),
  );
}

function filterForViewer(input) {
  const { viewerProfile, profiles, orders, products, tasks, activityLogs, stageFilterSet, scormPackages } = input;
  if (!viewerProfile) return { orders: [], products: [], tasks: [], activityLogs: [] };
  if (canSeeAllAssignments(viewerProfile)) {
    return { orders, products, tasks, activityLogs };
  }

  const orderIds = new Set();
  const productIds = new Set();
  const assignedTasks = tasks.filter(
    (task) => shouldIncludeStageIndex(stageFilterSet, task.stage_index) && taskAssignedToViewer(task, viewerProfile, profiles),
  );
  for (const task of assignedTasks) {
    orderIds.add(task.order_id);
    productIds.add(task.product_id);
  }

  for (const order of orders) {
    const assignments = readTrackingAssignments(order);
    for (const [key, assignment] of Object.entries(assignments)) {
      if (!trackingAssignedToViewer(assignment, viewerProfile, profiles)) continue;
      const productId = getTrackingProductId(key, assignment);
      const stageIndex = parseTrackingStageIndex(key, assignment);
      if (!productId) continue;
      if (!shouldIncludeStageIndex(stageFilterSet, stageIndex)) continue;
      orderIds.add(order.id);
      productIds.add(productId);
    }
  }

  for (const scormPackage of Array.isArray(scormPackages) ? scormPackages : []) {
    if (!profileMatchesProfileId(scormPackage.owner_profile_id, viewerProfile, profiles)) continue;
    orderIds.add(scormPackage.order_id);
    productIds.add(scormPackage.product_id);
  }

  const scopedOrders = orders.filter((order) => orderIds.has(order.id));
  const scopedProducts = products.filter((product) => productIds.has(product.id) || orderIds.has(product.order_id));
  const scopedTasks = assignedTasks;
  const scopedLogs = activityLogs.filter((log) => {
    const productId = typeof log.metadata?.product_id === 'string' ? log.metadata.product_id : null;
    const orderId = typeof log.metadata?.order_id === 'string' ? log.metadata.order_id : null;
    return (productId && productIds.has(productId)) || (orderId && orderIds.has(orderId));
  });

  return {
    orders: scopedOrders,
    products: scopedProducts,
    tasks: scopedTasks,
    activityLogs: scopedLogs,
  };
}

function filterScopedRows(rows, scoped) {
  const scopedProductKeys = new Set(scoped.products.map((product) => `${product.order_id}::${product.id}`));
  return (Array.isArray(rows) ? rows : []).filter((row) => scopedProductKeys.has(`${row.order_id}::${row.product_id}`));
}

function filterScopedReviewRows(rows, parents, parentIdField, reviewParentIdField) {
  const parentIds = new Set((Array.isArray(parents) ? parents : []).map((parent) => parent.id));
  return (Array.isArray(rows) ? rows : []).filter((row) => parentIds.has(row[reviewParentIdField]));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'my-tasks-preview', windowMs: 60_000, max: 90 })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, { ok: false, error: 'Server preview is not configured.' });
    return;
  }

  try {
    const url = new URL(req.url || '/api/my-tasks-preview', 'http://localhost');
    const role = String(url.searchParams.get('role') || 'specialist').trim().toLowerCase();
    const email = normalizeEmail(url.searchParams.get('email'));
    const includeActivityLogs = ['1', 'true', 'yes'].includes(
      String(url.searchParams.get('includeActivityLogs') || '').trim().toLowerCase(),
    );
    const stageIndices = parseStageIndices(url.searchParams.get('stages'));
    const stageFilterSet = stageIndices ? new Set(stageIndices) : null;
    const headers = buildHeaders(serviceRoleKey);
    const stageFilterQuery = stageIndices?.length ? `&stage_index=in.(${stageIndices.join(',')})` : '';

    const viewerProfileLookupPromise = fetchViewerProfileByEmail(supabaseUrl, headers, email);
    const [
      viewerProfileLookup,
      profiles,
      orders,
      products,
      tasks,
      activityLogs,
      inputItems,
      storyboards,
      storyboardReviews,
      slideDesigns,
      slideDesignReviews,
      voiceOvers,
      voiceReviews,
      videoEdits,
      videoReviews,
      scormPackages,
      scormReviews,
    ] = await Promise.all([
      viewerProfileLookupPromise,
      requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles?select=id,email,full_name,role,company_id,organization_id,title,active,access_scope,auth_user_id&active=is.true&order=full_name.asc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_orders?select=id,client,company_id,title,module,deadline,status,created_by_profile_id,intake_note,rejection_reason,change_request_reason,stage_sla_overrides,created_at,submitted_at,launched_at,assignees&order=created_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_products?select=id,order_id,name,current_stage_index,progress,ready_for_delivery,finished,delivered_at&order=created_at.asc`, { headers }),
      requestJson(
        `${supabaseUrl}/rest/v1/vcontent_tasks?select=id,order_id,product_id,stage_index,status,progress,due_date,assignee,assignee_profile_id,assignee_account_id,archived&archived=eq.false${stageFilterQuery}&order=due_date.asc.nullslast,created_at.desc`,
        { headers },
      ),
      includeActivityLogs
        ? requestJson(`${supabaseUrl}/rest/v1/vcontent_activity_logs?select=id,happened_at,actor_profile_id,action_type,object_type,object_id,summary,metadata&action_type=in.(workflow_step_assigned,task_started,workflow_step_started,workflow_file_uploaded,workflow_file_deleted,workflow_review_claimed,workflow_step_submitted,workflow_step_returned,workflow_step_approved)&order=happened_at.desc&limit=1000`, { headers })
        : Promise.resolve([]),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_input_items?select=id,order_id,product_id,module,item_code,label,item_type,required,status,file_name,file_url,notes,owner_profile_id,due_date,updated_at&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_storyboards?select=id,order_id,product_id,title,current_version,total_scenes,estimated_minutes,status,assignee_profile_id,reviewer_profile_id,due_date,submitted_at,approved_at,returned_at,file_name,notes&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_storyboard_reviews?select=id,storyboard_id,reviewer_profile_id,decision,comment,criteria,created_at&order=created_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_slide_designs?select=id,order_id,product_id,title,current_version,target_slides,completed_slides,status,designer_profile_id,qc_reviewer_profile_id,due_date,submitted_at,approved_at,returned_at,file_name,brand_spec,notes,checklist&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_slide_design_reviews?select=id,slide_design_id,reviewer_profile_id,decision,comment,criteria,created_at&order=created_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_voice_overs?select=id,order_id,product_id,title,current_version,estimated_minutes,recorded_minutes,status,talent_profile_id,handoff_profile_id,due_date,submitted_at,completed_at,returned_at,file_name,voice_style,notes,checklist&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_voice_reviews?select=id,voice_over_id,reviewer_profile_id,decision,comment,criteria,created_at&order=created_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_video_edits?select=id,order_id,product_id,title,current_version,target_minutes,render_progress,status,editor_profile_id,qc_reviewer_profile_id,due_date,submitted_at,approved_at,returned_at,file_name,subtitle_file,render_preset,notes,checklist&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_video_reviews?select=id,video_edit_id,reviewer_profile_id,decision,comment,criteria,created_at&order=created_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_scorm_packages?select=id,order_id,product_id,title,current_version,status,owner_profile_id,due_date,selected_question_ids,pass_score,randomize_questions,completion_rule,manifest_status,package_file_name,notes&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_scorm_reviews?select=id,scorm_package_id,reviewer_profile_id,decision,comment,criteria,created_at&order=created_at.desc`, { headers }),
    ]);

    const allProfiles = Array.isArray(profiles) ? profiles : [];
    const profilesWithViewer = viewerProfileLookup && !allProfiles.some((item) => item.id === viewerProfileLookup.id)
      ? [viewerProfileLookup, ...allProfiles]
      : allProfiles;
    const viewerProfileRow = viewerProfileLookup || (Array.isArray(profiles)
      ? (
          profiles.find((item) => email && normalizeEmail(item.email) === email) ||
          null
        )
      : null);
    const viewerProfile = toAuthProfile(viewerProfileRow);
    const scoped = filterForViewer({
      viewerProfile,
      profiles: profilesWithViewer,
      orders: Array.isArray(orders) ? orders : [],
      products: Array.isArray(products) ? products : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      activityLogs: Array.isArray(activityLogs) ? activityLogs : [],
      stageFilterSet,
      scormPackages: Array.isArray(scormPackages) ? scormPackages : [],
    });
    const workItems = buildWorkItems({
      viewerProfile,
      profiles: profilesWithViewer,
      orders: Array.isArray(orders) ? orders : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      stageFilterSet,
    });
    const scopedStoryboards = filterScopedRows(storyboards, scoped);
    const scopedSlideDesigns = normalizeChecklistRows(filterScopedRows(slideDesigns, scoped));
    const scopedVoiceOvers = normalizeChecklistRows(filterScopedRows(voiceOvers, scoped));
    const scopedVideoEdits = normalizeChecklistRows(filterScopedRows(videoEdits, scoped));
    const scopedScormPackages = filterScopedRows(scormPackages, scoped);

    sendJson(res, 200, {
      ok: true,
      viewerProfile,
      profiles: profilesWithViewer,
      workItems,
      inputItems: filterScopedRows(inputItems, scoped),
      storyboards: scopedStoryboards,
      storyboardReviews: filterScopedReviewRows(storyboardReviews, scopedStoryboards, 'id', 'storyboard_id'),
      slideDesigns: scopedSlideDesigns,
      slideDesignReviews: filterScopedReviewRows(slideDesignReviews, scopedSlideDesigns, 'id', 'slide_design_id'),
      voiceOvers: scopedVoiceOvers,
      voiceReviews: filterScopedReviewRows(voiceReviews, scopedVoiceOvers, 'id', 'voice_over_id'),
      videoEdits: scopedVideoEdits,
      videoReviews: filterScopedReviewRows(videoReviews, scopedVideoEdits, 'id', 'video_edit_id'),
      scormPackages: scopedScormPackages,
      scormReviews: filterScopedReviewRows(scormReviews, scopedScormPackages, 'id', 'scorm_package_id'),
      ...scoped,
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}
