function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function valueByAliases(row, aliases) {
  const normalized = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value]));
  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function validateRosterRows(rows, expectedClassCodes = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const errors = [];
  const warnings = [];
  const learners = [];
  const knownClasses = new Set(expectedClassCodes.map((item) => String(item).trim()).filter(Boolean));
  const seenIdentity = new Set();
  sourceRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const classCode = valueByAliases(row, ['class_code', 'class code', 'mã lớp', 'ma lop', 'lớp', 'lop']);
    const email = valueByAliases(row, ['email', 'email học viên', 'email hoc vien']);
    const learnerCode = valueByAliases(row, ['learner_code', 'student_code', 'mã học viên', 'ma hoc vien', 'mã nhân viên', 'ma nhan vien']);
    const fullName = valueByAliases(row, ['full_name', 'name', 'họ tên', 'ho ten', 'tên học viên', 'ten hoc vien']);
    const groupCode = valueByAliases(row, ['group_code', 'group', 'mã nhóm', 'ma nhom', 'nhóm', 'nhom']);
    if (!classCode && !email && !learnerCode && !fullName) return;
    if (!classCode) errors.push(`Dòng ${rowNumber}: thiếu mã lớp.`);
    if (!email && !learnerCode) errors.push(`Dòng ${rowNumber}: cần email hoặc mã học viên.`);
    if (knownClasses.size && classCode && !knownClasses.has(classCode)) errors.push(`Dòng ${rowNumber}: mã lớp ${classCode} không thuộc dự án.`);
    const identity = `${classCode}|${(email || learnerCode).toLowerCase()}`;
    if (seenIdentity.has(identity)) errors.push(`Dòng ${rowNumber}: học viên bị trùng trong lớp ${classCode}.`);
    seenIdentity.add(identity);
    learners.push({ classCode, groupCode, email, learnerCode, fullName, sourceRow: rowNumber });
  });
  if (!learners.length) errors.push('File không có dòng học viên hợp lệ.');
  if (learners.some((item) => !item.fullName)) warnings.push('Một số học viên chưa có họ tên; hệ thống sẽ dùng email hoặc mã học viên để đối soát.');
  const classes = [...new Set(learners.map((item) => item.classCode).filter(Boolean))].map((code) => ({ code }));
  const groups = [...new Map(learners.filter((item) => item.groupCode).map((item) => [`${item.classCode}|${item.groupCode}`, { classCode: item.classCode, code: item.groupCode }])).values()];
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data: { classes, groups, learners },
    summary: { rowCount: learners.length, classCount: classes.length, groupCount: groups.length, errorCount: errors.length, warningCount: warnings.length },
  };
}

export function validateContentInput(fields, file) {
  const data = fields && typeof fields === 'object' ? fields : {};
  const values = Object.values(data).map((value) => String(value || '').trim()).filter(Boolean);
  const errors = values.length || file ? [] : ['Cần nhập ít nhất một trường hoặc đính kèm file.'];
  return { valid: errors.length === 0, errors, warnings: [], data };
}

